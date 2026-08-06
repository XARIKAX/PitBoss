'use client';

/**
 * Shared transaction plumbing.
 *
 * `useTx().send(...)` wraps wagmi's writeContract + waitForTransactionReceipt
 * with the TxToast lifecycle (pending -> success/error, explorer link from the
 * chain config) and invalidates all react-query reads on success so live data
 * refreshes. `approveIfNeeded` implements the standard ERC20 allowance
 * check -> approve step used by every buy flow.
 */
import { useCallback, useState } from 'react';
import { useChainId, useConfig } from 'wagmi';
import { readContract, writeContract, waitForTransactionReceipt } from 'wagmi/actions';
import { useQueryClient } from '@tanstack/react-query';
import type { Abi, Address, TransactionReceipt } from 'viem';
import { BaseError } from 'viem';
import { useToast } from '@/components/TxToast';
import { ABIS } from '@/lib/contracts';

export type TxRequest = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

export type TxOptions = {
  /** Toast title, e.g. "Buy next Boss". Defaults to the function name. */
  title?: string;
  onSuccess?: (receipt: TransactionReceipt) => void;
};

function errorMessage(err: unknown): string {
  if (err instanceof BaseError) return err.shortMessage;
  if (err instanceof Error) return err.message.slice(0, 220);
  return 'Transaction failed';
}

export function useTx() {
  const config = useConfig();
  const chainId = useChainId();
  const { push, dismiss } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (req: TxRequest, opts?: TxOptions): Promise<TransactionReceipt | null> => {
      const title = opts?.title ?? req.functionName;
      setBusy(true);
      const pendingId = push({ kind: 'pending', title: `${title}…`, message: 'Confirm in wallet' });
      try {
        const hash = await writeContract(config, {
          address: req.address,
          abi: req.abi,
          functionName: req.functionName,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          args: req.args as any,
          value: req.value,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        const receipt = await waitForTransactionReceipt(config, { hash });
        dismiss(pendingId);
        if (receipt.status === 'success') {
          push({ kind: 'success', title: `${title} confirmed`, chainId, hash });
          await queryClient.invalidateQueries();
          opts?.onSuccess?.(receipt);
          return receipt;
        }
        push({ kind: 'error', title: `${title} reverted`, chainId, hash });
        return null;
      } catch (err) {
        dismiss(pendingId);
        push({ kind: 'error', title: `${title} failed`, message: errorMessage(err) });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [config, chainId, push, dismiss, queryClient],
  );

  /**
   * Ensure `spender` can pull `amount` of `token` from `owner`. Sends an
   * approve when the current allowance is short. Returns true when spendable.
   */
  const approveIfNeeded = useCallback(
    async (token: Address, owner: Address, spender: Address, amount: bigint): Promise<boolean> => {
      try {
        const allowance = (await readContract(config, {
          address: token,
          abi: ABIS.erc20,
          functionName: 'allowance',
          args: [owner, spender],
        })) as bigint;
        if (allowance >= amount) return true;
      } catch {
        // fall through to approve attempt
      }
      const receipt = await send(
        { address: token, abi: ABIS.erc20, functionName: 'approve', args: [spender, amount] },
        { title: 'Approve token' },
      );
      return receipt != null;
    },
    [config, send],
  );

  return { send, approveIfNeeded, busy };
}
