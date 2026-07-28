"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import billingService from "@/lib/services/billing-service";
import type { BillingPlanId } from "@/lib/billing/config";
import { useAuth } from "@/lib/hooks/auth/use-auth";

export const billingKeys = {
  all: ["billing"] as const,
  summary: (uid: string) => [...billingKeys.all, uid] as const,
  detail: (uid: string) => [...billingKeys.summary(uid), "detail"] as const,
};

export const useBilling = () => {
  const { uid } = useAuth();
  return useQuery({
    queryKey: billingKeys.detail(uid ?? ""),
    queryFn: () => billingService.getBilling(),
    enabled: Boolean(uid),
    staleTime: 30_000,
  });
};

export const useBillingActions = () => {
  const { uid } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: billingKeys.summary(uid ?? ""),
    });

  const checkout = useMutation({
    mutationFn: (planId: Exclude<BillingPlanId, "free">) =>
      billingService.startCheckout(planId),
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
    mutationFn: (credits: number) =>
      billingService.startRechargeCheckout(credits),
    onSuccess: async () => {
      await invalidate();
    },
  });

  const changePlan = useMutation({
    mutationFn: (planId: Exclude<BillingPlanId, "free">) =>
      billingService.changeSubscription(planId),
    onSuccess: async () => {
      await invalidate();
    },
  });

  return { checkout, recharge, changePlan, cancel };
};
