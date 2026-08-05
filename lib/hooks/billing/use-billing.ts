"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import billingService from "@/lib/services/billing-service";
import type { BillingPlanId } from "@/lib/billing/config";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import {
  createDefaultClientBilling,
  toBillingSummary,
} from "@/lib/billing/summary";
import { userKeys, useUser } from "@/lib/hooks/user/use-user";

export const useBilling = () => {
  const userQuery = useUser();
  const data = useMemo(
    () =>
      userQuery.data
        ? {
            billing: toBillingSummary(
              userQuery.data.billing ?? createDefaultClientBilling(),
            ),
          }
        : undefined,
    [userQuery.data],
  );
  const refetch = useCallback(
    async (...args: Parameters<typeof userQuery.refetch>) => {
      const result = await userQuery.refetch(...args);
      return {
        ...result,
        data: result.data
          ? {
              billing: toBillingSummary(
                result.data.billing ?? createDefaultClientBilling(),
              ),
            }
          : undefined,
      };
    },
    [userQuery.refetch],
  );

  return {
    ...userQuery,
    data,
    refetch,
  };
};

export const useBillingActions = () => {
  const { uid } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: userKeys.detail(uid ?? ""),
    });

  const checkout = useMutation({
    mutationFn: ({
      planId,
      onPaymentCompleted,
    }: {
      planId: Exclude<BillingPlanId, "free">;
      onPaymentCompleted?: () => void;
    }) => billingService.startCheckout(planId, onPaymentCompleted),
    onSuccess: async () => {
      await invalidate();
    },
  });

  const cancel = useMutation({
    mutationFn: () => billingService.cancelSubscription(),
    onSuccess: async () => {
      await invalidate();
    },
  });

  const recharge = useMutation({
    mutationFn: ({
      credits,
      onPaymentCompleted,
    }: {
      credits: number;
      onPaymentCompleted?: () => void;
    }) =>
      billingService.startRechargeCheckout(credits, onPaymentCompleted),
    onSuccess: async () => {
      await invalidate();
    },
  });

  const changePlan = useMutation({
    mutationFn: ({
      planId,
      onPaymentCompleted,
    }: {
      planId: Exclude<BillingPlanId, "free">;
      onPaymentCompleted?: () => void;
    }) => billingService.changeSubscription(planId, onPaymentCompleted),
    onSuccess: async () => {
      await invalidate();
    },
  });

  return { checkout, recharge, changePlan, cancel };
};
