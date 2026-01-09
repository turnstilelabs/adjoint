'use client';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ConfirmResetDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
};

export function ConfirmResetDialog({ open, onOpenChange, onConfirm }: ConfirmResetDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Leave and reset progress?</AlertDialogTitle>
                    <AlertDialogDescription>
                        You will lose your current progress in this session.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => {
                            onOpenChange(false);
                            onConfirm();
                        }}
                    >
                        Continue
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
