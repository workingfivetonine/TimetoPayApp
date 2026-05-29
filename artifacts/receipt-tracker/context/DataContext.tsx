import React, { createContext, useContext } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListReceiptsQueryKey,
  getListStoresQueryKey,
  getListItemsQueryKey,
  getGetShoppingListQueryKey,
  getGetSpendAnalyticsQueryKey,
} from "@workspace/api-client-react";

interface DataContextValue {
  invalidateAll: () => void;
  invalidateReceipts: () => void;
  invalidateStores: () => void;
  invalidateItems: () => void;
  invalidateShoppingList: () => void;
  invalidateAnalytics: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const invalidateReceipts = () => {
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
  };
  const invalidateStores = () => {
    queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
  };
  const invalidateItems = () => {
    queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
  };
  const invalidateShoppingList = () => {
    queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
  };
  const invalidateAnalytics = () => {
    queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
  };
  const invalidateAll = () => {
    invalidateReceipts();
    invalidateStores();
    invalidateItems();
    invalidateShoppingList();
    invalidateAnalytics();
  };

  return (
    <DataContext.Provider
      value={{
        invalidateAll,
        invalidateReceipts,
        invalidateStores,
        invalidateItems,
        invalidateShoppingList,
        invalidateAnalytics,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
