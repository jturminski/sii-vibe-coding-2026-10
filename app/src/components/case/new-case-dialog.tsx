"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { pl } from "@/lib/i18n/pl";

/** "Nowe zgłoszenie" with the PRD §4.7 confirmation (AC-38); cancel leaves everything unchanged. */
export function NewCaseDialog({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline">
          {pl.chat.newCase}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pl.chat.newCase}</AlertDialogTitle>
          <AlertDialogDescription>{pl.dialog.newCaseMessage}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{pl.dialog.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{pl.dialog.confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
