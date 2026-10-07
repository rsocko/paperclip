import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, LoaderCircle, Plus, ShieldAlert, Trash2, X } from "lucide-react";
import type { BoardApiKey, CreateBoardApiKeyInput, CreatedBoardApiKey } from "@/api/access";
import { accessApi } from "@/api/access";
import type { PageTabItem } from "@/components/PageTabBar";
import { StatusBadge } from "@/components/StatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryKeys } from "@/lib/queryKeys";
import { useCopyAction } from "@/lib/use-copy-action";
import { formatDateTime } from "@/lib/utils";

type ExpirationOption = "default" | "7-days" | "90-days" | "never";

export const PROFILE_SETTINGS_TABS: readonly PageTabItem[] = [
  { value: "general", label: "General" },
  { value: "api-keys", label: "API Keys" },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function expirationFor(option: ExpirationOption): string | null | undefined {
  if (option === "default") return undefined;
  if (option === "never") return null;
  const days = option === "7-days" ? 7 : 90;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function keyStatus(key: BoardApiKey): "active" | "expired" | "revoked" {
  if (key.revokedAt) return "revoked";
  if (key.expiresAt && Date.parse(key.expiresAt) <= Date.now()) return "expired";
  return "active";
}

function KeySecret({ created, onDismiss }: { created: CreatedBoardApiKey; onDismiss: () => void }) {
  const copyAction = useCopyAction();

  return (
    <section className="space-y-3 rounded-lg border border-border bg-muted/40 p-4" aria-labelledby="new-board-key-title">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 id="new-board-key-title" className="text-sm font-semibold">Copy your new API key</h3>
          <p className="text-sm text-muted-foreground">
            This secret is shown once. Store it in your password manager or deployment secret store now.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Dismiss new API key">
          <X />
        </Button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={created.token}
          readOnly
          aria-label={`New API key for ${created.name}`}
          className="font-mono text-xs"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" variant="secondary" onClick={() => void copyAction.copy(created.token)}>
          {copyAction.copied ? <Check /> : <Copy />}
          {copyAction.copied ? "Copied" : copyAction.failed ? "Copy failed" : "Copy key"}
        </Button>
      </div>
      {copyAction.failed ? (
        <p className="text-sm text-destructive">Clipboard access failed. Select the key and copy it manually.</p>
      ) : null}
    </section>
  );
}

export function ProfileApiKeys({ companyId }: { companyId: string | null }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [expiration, setExpiration] = useState<ExpirationOption>("default");
  const [showInactive, setShowInactive] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedBoardApiKey | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<BoardApiKey | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const keysQuery = useQuery({
    queryKey: queryKeys.access.boardApiKeys(showInactive),
    queryFn: () => accessApi.listBoardApiKeys(showInactive),
  });

  const refreshKeys = () =>
    queryClient.invalidateQueries({ queryKey: ["access", "board-api-keys"] });

  const createMutation = useMutation({
    mutationFn: (input: CreateBoardApiKeyInput) => accessApi.createBoardApiKey(input),
    onSuccess: async (key) => {
      setActionError(null);
      setCreatedKey(key);
      setName("");
      setExpiration("default");
      await refreshKeys();
    },
    onError: (error) => {
      setActionError(errorMessage(error, "Failed to create API key."));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => accessApi.revokeBoardApiKey(keyId),
    onSuccess: async () => {
      setActionError(null);
      setRevokeTarget(null);
      await refreshKeys();
    },
    onError: (error) => {
      setActionError(errorMessage(error, "Failed to revoke API key."));
    },
  });

  const keys = keysQuery.data ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-4" aria-labelledby="create-board-key-title">
        <div className="space-y-1">
          <h2 id="create-board-key-title" className="text-lg font-semibold">Create an API key</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            API keys let external tools act with your Paperclip board access. Use a distinct key for each integration so you can revoke it independently.
          </p>
        </div>

        <form
          className="grid gap-4 lg:grid-cols-3 lg:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmedName = name.trim();
            if (!trimmedName) return;
            const expiresAt = expirationFor(expiration);
            createMutation.mutate({
              name: trimmedName,
              ...(expiresAt === undefined ? {} : { expiresAt }),
              requestedCompanyId: companyId,
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="board-key-name">Name</Label>
            <Input
              id="board-key-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Mission Control"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="board-key-expiration">Expiration</Label>
            <Select value={expiration} onValueChange={(value) => setExpiration(value as ExpirationOption)}>
              <SelectTrigger id="board-key-expiration" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">30 days</SelectItem>
                <SelectItem value="7-days">7 days</SelectItem>
                <SelectItem value="90-days">90 days</SelectItem>
                <SelectItem value="never">Never expires</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
            {createMutation.isPending ? <LoaderCircle className="animate-spin" /> : <Plus />}
            {createMutation.isPending ? "Creating..." : "Create key"}
          </Button>
        </form>

        {expiration === "never" ? (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>Non-expiring keys remain valid until you revoke them. Prefer a finite lifetime when the integration supports rotation.</span>
          </div>
        ) : null}

        {createdKey ? <KeySecret created={createdKey} onDismiss={() => setCreatedKey(null)} /> : null}
      </section>

      {actionError ? (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      <section className="space-y-4" aria-labelledby="personal-board-keys-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h2 id="personal-board-keys-title" className="text-lg font-semibold">Your API keys</h2>
            <p className="text-sm text-muted-foreground">Only keys issued to your account are shown here.</p>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-inactive-board-keys"
              checked={showInactive}
              onCheckedChange={(checked) => setShowInactive(checked === true)}
            />
            <Label htmlFor="show-inactive-board-keys" className="font-normal">Show expired and revoked</Label>
          </div>
        </div>

        {keysQuery.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading API keys...
          </div>
        ) : keysQuery.error ? (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage(keysQuery.error, "Failed to load API keys.")}
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
            <KeyRound className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">No API keys</p>
            <p className="text-sm text-muted-foreground">
              {showInactive ? "No active, expired, or revoked keys were found." : "Create a key for your first external integration."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-3xl text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Name</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Created</th>
                  <th scope="col" className="px-4 py-3 font-medium">Last used</th>
                  <th scope="col" className="px-4 py-3 font-medium">Expires</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map((key) => {
                  const status = keyStatus(key);
                  return (
                    <tr key={key.id}>
                      <td className="px-4 py-3 font-medium">{key.name}</td>
                      <td className="px-4 py-3"><StatusBadge status={status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDateTime(key.createdAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {key.lastUsedAt ? formatDateTime(key.lastUsedAt) : "Never"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {key.expiresAt ? formatDateTime(key.expiresAt) : "Never"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {status === "active" ? (
                          <Button type="button" variant="ghost" size="sm" onClick={() => setRevokeTarget(key)}>
                            <Trash2 />
                            Revoke
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unavailable</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AlertDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => {
          if (!open && !revokeMutation.isPending) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revokeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Any integration using this key will immediately lose Paperclip access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={revokeMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (revokeTarget) revokeMutation.mutate(revokeTarget.id);
              }}
            >
              {revokeMutation.isPending ? "Revoking..." : "Revoke key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
