'use client';

import { useState } from 'react';
import { CheckCircle, MessageSquare, FilePenLine, Sigma, CheckCircle2, Rocket, Puzzle, Lightbulb, Save, X } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { KatexRenderer } from './katex-renderer';
import { VerifyModal } from './verify-modal';
import { Textarea } from './ui/textarea';
import { Avatar, AvatarFallback } from './ui/avatar';

interface SublemmaItemProps {
  step: number;
  title: string;
  content: string;
  isLast: boolean;
}

const icons = [
    { Icon: Sigma, bg: 'bg-blue-100', text: 'text-blue-600' },
    { Icon: Sigma, bg: 'bg-blue-100', text: 'text-blue-600' },
    { Icon: CheckCircle2, bg: 'bg-green-100', text: 'text-green-600' },
    { Icon: Rocket, bg: 'bg-purple-100', text: 'text-purple-600' },
    { Icon: Puzzle, bg: 'bg-orange-100', text: 'text-orange-600' },
    { Icon: Puzzle, bg: 'bg-orange-100', text: 'text-orange-600' },
    { Icon: Lightbulb, bg: 'bg-indigo-100', text: 'text-indigo-600' },
];

export function SublemmaItem({ step, title, content: initialContent, isLast }: SublemmaItemProps) {
  const { Icon, bg, text } = icons[(step - 1) % icons.length];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [verifiedContent, setVerifiedContent] = useState<string | null>(null);

  // State for revision
  const [isRevising, setIsRevising] = useState(false);
  const [currentContent, setCurrentContent] = useState(initialContent);
  const [revisedContent, setRevisedContent] = useState(initialContent);
  
  // State for comments
  const [comments, setComments] = useState<string[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isCommenting, setIsCommenting] = useState(false);

  const handleVerificationComplete = (proof: string) => {
    setVerifiedContent(proof);
    setIsModalOpen(false);
  };

  const handleRevisionSave = () => {
    setCurrentContent(revisedContent);
    setIsRevising(false);
  };

  const handleRevisionCancel = () => {
    setRevisedContent(currentContent);
    setIsRevising(false);
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      setComments([...comments, newComment]);
      setNewComment('');
      setIsCommenting(false);
    }
  };
  
  return (
    <>
      <AccordionItem value={`item-${step}`} className="bg-card border-gray-200 rounded-xl shadow-sm overflow-hidden border">
        <AccordionTrigger className="flex items-center justify-between w-full p-5 cursor-pointer hover:bg-muted/50 hover:no-underline">
          <div className="flex items-center gap-4">
            <span className={`p-2 rounded-full ${bg}`}>
                <Icon className={`h-5 w-5 ${text}`} />
            </span>
            <span className="text-base font-medium text-gray-900 font-headline">{title}</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-5 pt-0 border-t">
          <div className="py-4">
            {isRevising ? (
              <div className="space-y-2">
                <Textarea 
                  value={revisedContent}
                  onChange={(e) => setRevisedContent(e.target.value)}
                  className="h-32"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={handleRevisionCancel}><X className="mr-1.5 h-4 w-4" /> Cancel</Button>
                  <Button size="sm" onClick={handleRevisionSave}><Save className="mr-1.5 h-4 w-4" /> Save</Button>
                </div>
              </div>
            ) : (
              <>
                <KatexRenderer content={currentContent} />
              </>
            )}
          </div>

          {verifiedContent && (
             <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h4 className="text-sm font-semibold mb-2 text-gray-700">Verified Sub-Proof:</h4>
                <pre className="w-full bg-gray-900 text-gray-200 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap">
                    <code>{verifiedContent}</code>
                </pre>
            </div>
          )}

          <div className="flex items-center gap-2 mt-4">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs font-semibold text-green-700 bg-green-100 hover:bg-green-200 hover:text-green-700 rounded-full"
              onClick={() => setIsModalOpen(true)}
            >
              <CheckCircle className="mr-1.5 h-4 w-4" />
              Verify
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 hover:text-gray-700 rounded-full"
              onClick={() => setIsCommenting(!isCommenting)}
            >
              <MessageSquare className="mr-1.5 h-4 w-4" />
              Comment
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 hover:text-blue-700 rounded-full"
              onClick={() => setIsRevising(true)}
              disabled={isRevising}
            >
              <FilePenLine className="mr-1.5 h-4 w-4" />
              Revise
            </Button>
          </div>
          
          {(isCommenting || comments.length > 0) && (
            <div className="mt-4 pt-4 border-t">
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Comments</h4>
              <div className="space-y-4">
                {comments.map((comment, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{['U1', 'U2', 'U3'][index % 3]}</AvatarFallback>
                    </Avatar>
                    <div className="bg-gray-100 rounded-lg p-3 text-sm flex-1">
                      <p>{comment}</p>
                    </div>
                  </div>
                ))}
              </div>

              {isCommenting && (
                <div className="mt-4 flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                      <AvatarFallback>U1</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                      <Textarea 
                        placeholder="Add your comment..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        rows={2}
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setIsCommenting(false); setNewComment(''); }}>Cancel</Button>
                        <Button size="sm" onClick={handleAddComment}>Post</Button>
                      </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
      <VerifyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        step={step}
        lemma={currentContent}
        onProofComplete={handleVerificationComplete}
      />
    </>
  );
}
