import { Plus, History } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Logo } from './logo';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export function AppSidebar() {
  return (
    <aside className="w-72 bg-card border-r flex flex-col shrink-0">
      <div className="flex items-center gap-3 px-6 py-4 border-b">
        <Logo />
        <h1 className="text-xl font-bold font-headline text-foreground">ProofGenius</h1>
      </div>
      <nav className="p-6">
        <Button asChild className="w-full justify-start text-base py-6">
          <Link href="/">
            <Plus className="mr-2 h-5 w-5" />
            New Proof
          </Link>
        </Button>
      </nav>
      <div className="flex-1 overflow-y-auto px-6">
        <Accordion type="single" collapsible defaultValue="item-1">
          <AccordionItem value="item-1" className="border-b-0">
            <AccordionTrigger className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-2 hover:no-underline">
              Proof Outline History
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <History className="h-4 w-4" />
                <span>Autosaved a few seconds ago</span>
              </div>
              <div className="space-y-2">
                <Link
                  href="#"
                  className="block p-3 rounded-lg hover:bg-muted border border-border bg-background"
                >
                  <p className="text-sm font-medium text-foreground">Version 4: Current</p>
                  <p className="text-xs text-muted-foreground mt-1">July 20, 2024 - 10:45 AM</p>
                </Link>
                <Link href="#" className="block p-3 rounded-lg hover:bg-muted border border-transparent">
                  <p className="text-sm font-medium text-foreground">Version 3</p>
                  <p className="text-xs text-muted-foreground mt-1">July 20, 2024 - 10:40 AM</p>
                </Link>
                <Link href="#" className="block p-3 rounded-lg hover:bg-muted border border-transparent">
                  <p className="text-sm font-medium text-foreground">Version 1: Initial Proof</p>
                  <p className="text-xs text-muted-foreground mt-1">July 20, 2024 - 10:30 AM</p>
                </Link>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      <div className="mt-auto p-6 border-t">
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarImage src="https://picsum.photos/seed/1/40/40" data-ai-hint="person" />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium text-foreground">John Doe</p>
            <a href="#" className="text-xs text-muted-foreground hover:text-primary">
              View profile
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}
