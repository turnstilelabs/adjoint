import { ProofDiff } from '@/components/chat/message/computeProofDiff';
import { KatexRenderer } from '@/components/katex-renderer';

function MessageSuggestionDiff({ diff }: { diff: ProofDiff }) {
  if (!diff.length) {
    return <div className="text-xs text-muted-foreground">No impact on the proof.</div>;
  }

  return diff.map((ch, i) => {
    if (ch.kind === 'add') {
      return (
        <div key={i} className="rounded border border-muted-foreground/10 p-2">
          <div className="text-sm font-semibold">
            Add step at position {ch.at + 1}:{' '}
            <KatexRenderer
              content={ch.step.title || `Step ${ch.at + 1}`}
              className="inline"
              autoWrap={false}
            />
          </div>
          <div className="mt-1 text-sm space-y-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Statement</div>
              <KatexRenderer content={ch.step.statement} />
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Proof</div>
              <KatexRenderer content={ch.step.proof} />
            </div>
          </div>
        </div>
      );
    }
    if (ch.kind === 'remove') {
      return (
        <div key={i} className="rounded border border-muted-foreground/10 p-2">
          <div className="text-sm font-semibold">
            Remove step at position {ch.at + 1}:{' '}
            <KatexRenderer
              content={ch.step.title || `Step ${ch.at + 1}`}
              className="inline"
              autoWrap={false}
            />
          </div>
        </div>
      );
    }
    // modify
    return (
      <div key={i} className="rounded border border-muted-foreground/10 p-2">
        <div className="text-sm font-semibold">
          Modify step at position {ch.at + 1}:{' '}
          <KatexRenderer
            content={ch.next.title || ch.old.title || `Step ${ch.at + 1}`}
            className="inline"
            autoWrap={false}
          />
        </div>
        <div className="mt-1 text-sm space-y-2">
          {ch.titleChanged && (
            <div className="text-xs">
              <span className="font-medium text-muted-foreground">Title</span>{' '}
              <span className="inline-block px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] align-middle ml-1">
                updated
              </span>
              <div className="mt-1">
                <KatexRenderer
                  content={ch.old.title || `Step ${ch.at + 1}`}
                  className="inline line-through opacity-70"
                  autoWrap={false}
                />
                <span className="mx-2">→</span>
                <KatexRenderer
                  content={ch.next.title || `Step ${ch.at + 1}`}
                  className="inline font-medium"
                  autoWrap={false}
                />
              </div>
            </div>
          )}
          {ch.statementChanged && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Statement{' '}
                <span className="ml-1 inline-block px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">
                  updated
                </span>
              </div>
              <KatexRenderer content={ch.next.statement} />
            </div>
          )}
          {ch.proofChanged && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Proof{' '}
                <span className="ml-1 inline-block px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">
                  updated
                </span>
              </div>
              <KatexRenderer content={ch.next.proof} />
            </div>
          )}
        </div>
      </div>
    );
  });
}

export default MessageSuggestionDiff;
