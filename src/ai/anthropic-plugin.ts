/**
 * Custom Anthropic plugin for Genkit that supports structured JSON output
 * by using tool_choice to force the model to return structured data.
 */

import Anthropic from '@anthropic-ai/sdk';
import { genkitPluginV2, model } from 'genkit/plugin';
import { z, GenerationCommonConfigSchema } from 'genkit';
import type { MessageData } from 'genkit/model';

const AnthropicConfigSchema = GenerationCommonConfigSchema.extend({
  tool_choice: z.union([
    z.object({ type: z.literal('auto') }),
    z.object({ type: z.literal('any') }),
    z.object({ type: z.literal('tool'), name: z.string() }),
  ]).optional(),
});

// Model definitions with JSON output support
const modelDefs = {
  'claude-4-sonnet': {
    version: 'claude-sonnet-4-20250514',
    label: 'Anthropic - Claude 4 Sonnet',
  },
  'claude-4-opus': {
    version: 'claude-opus-4-20250514',
    label: 'Anthropic - Claude 4 Opus',
  },
  'claude-3-7-sonnet': {
    version: 'claude-3-7-sonnet-latest',
    label: 'Anthropic - Claude 3.7 Sonnet',
  },
  'claude-3-5-sonnet': {
    version: 'claude-3-5-sonnet-latest',
    label: 'Anthropic - Claude 3.5 Sonnet',
  },
  'claude-3-5-haiku': {
    version: 'claude-3-5-haiku-latest',
    label: 'Anthropic - Claude 3.5 Haiku',
  },
} as const;

type ModelName = keyof typeof modelDefs;

// Convert Zod schema to JSON Schema for Anthropic tools
function zodToJsonSchema(schema: z.ZodType<any>): any {
  if ('_def' in schema) {
    return zodDefToJsonSchema(schema._def);
  }
  return { type: 'object' };
}

function zodDefToJsonSchema(def: any): any {
  if (!def) return { type: 'object' };

  const typeName = def.typeName;

  switch (typeName) {
    case 'ZodObject': {
      const properties: Record<string, any> = {};
      const required: string[] = [];
      const shape = def.shape?.();
      if (shape) {
        for (const [key, value] of Object.entries(shape)) {
          properties[key] = zodDefToJsonSchema((value as any)._def);
          if ((value as any)._def?.typeName !== 'ZodOptional' &&
              (value as any)._def?.typeName !== 'ZodNullable') {
            required.push(key);
          }
        }
      }
      return {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray':
      return {
        type: 'array',
        items: zodDefToJsonSchema(def.type?._def),
      };
    case 'ZodEnum':
      return {
        type: 'string',
        enum: def.values,
      };
    case 'ZodNullable':
    case 'ZodOptional':
      const inner = zodDefToJsonSchema(def.innerType?._def);
      if (typeName === 'ZodNullable') {
        return { ...inner, nullable: true };
      }
      return inner;
    case 'ZodLiteral':
      return { type: typeof def.value, const: def.value };
    case 'ZodUnion':
      return {
        anyOf: def.options?.map((opt: any) => zodDefToJsonSchema(opt._def)) || [],
      };
    case 'ZodDefault':
      return zodDefToJsonSchema(def.innerType?._def);
    default:
      return { type: 'object' };
  }
}

function toAnthropicMessages(messages: MessageData[]): Anthropic.MessageParam[] {
  return messages
    .filter(msg => msg.role !== 'system')
    .map((msg) => ({
      role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
      content: msg.content.map((part) => {
        if (part.text) return { type: 'text' as const, text: part.text };
        if (part.media) {
          return {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: (part.media.contentType || 'image/png') as 'image/png',
              data: part.media.url.replace(/^data:[^;]+;base64,/, ''),
            },
          };
        }
        return { type: 'text' as const, text: '' };
      }),
    }));
}

function createModelRunner(name: ModelName, client: Anthropic) {
  const def = modelDefs[name];

  return async (request: any) => {
    const messages = toAnthropicMessages(request.messages);

    // Get system message
    let systemMsg: string | undefined;
    const systemMessage = request.messages.find((m: MessageData) => m.role === 'system');
    if (systemMessage?.content[0]?.text) {
      systemMsg = systemMessage.content[0].text;
    }

    // Check if JSON output is requested
    const wantsJson = request.output?.format === 'json' && request.output?.schema;

    let response: Anthropic.Message;

    if (wantsJson && request.output?.schema) {
      // Use tool_choice to force structured output
      const jsonSchema = zodToJsonSchema(request.output.schema as z.ZodType<any>);

      const toolName = 'structured_output';
      const tools: Anthropic.Tool[] = [{
        name: toolName,
        description: 'Output the response in the required structured format',
        input_schema: {
          type: 'object' as const,
          ...jsonSchema,
        },
      }];

      response = await client.messages.create({
        model: def.version,
        max_tokens: request.config?.maxOutputTokens || 8192,
        ...(systemMsg ? { system: systemMsg } : {}),
        messages,
        tools,
        tool_choice: { type: 'tool', name: toolName },
      });

      // Extract the tool result
      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUse) {
        const jsonOutput = JSON.stringify(toolUse.input);
        return {
          message: {
            role: 'model' as const,
            content: [{ text: jsonOutput }],
          },
          finishReason: 'stop' as const,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          },
        };
      }
    }

    // Standard text generation
    response = await client.messages.create({
      model: def.version,
      max_tokens: request.config?.maxOutputTokens || 8192,
      ...(systemMsg ? { system: systemMsg } : {}),
      messages,
    });

    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      message: {
        role: 'model' as const,
        content: [{ text: textContent }],
      },
      finishReason: (response.stop_reason === 'end_turn' ? 'stop' : 'other') as 'stop' | 'other',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  };
}

function createModel(name: ModelName, client: Anthropic) {
  const def = modelDefs[name];

  return model(
    {
      name: `anthropic/${name}`,
      label: def.label,
      supports: {
        multiturn: true,
        tools: true,
        media: true,
        systemRole: true,
        output: ['text', 'json'],
      },
      configSchema: AnthropicConfigSchema,
    },
    createModelRunner(name, client)
  );
}

export function anthropicWithJsonSupport(options?: { apiKey?: string }) {
  const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  const client = new Anthropic({ apiKey });

  return genkitPluginV2({
    name: 'anthropic',
    init: async () => {
      const actions: any[] = [];
      for (const name of Object.keys(modelDefs) as ModelName[]) {
        actions.push(createModel(name, client));
      }
      return actions;
    },
    resolve: (actionType: string, actionName: string) => {
      if (actionType === 'model') {
        const name = actionName as ModelName;
        if (modelDefs[name]) {
          return createModel(name, client);
        }
      }
      return undefined;
    },
  });
}
