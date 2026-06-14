import React, { createContext, useContext, useState, useCallback } from "react";

interface BoardNotificationContextValue {
  newCount: number;
  setNewCount: (n: number) => void;
  clearNew: () => void;
}

const BoardNotificationContext = createContext<BoardNotificationContextValue>({
  newCount: 0,
  setNewCount: () => {},
  clearNew: () => {},
});

export function BoardNotificationProvider({ children }: { children: React.ReactNode }) {
  const [newCount, setNewCount] = useState(0);
  const clearNew = useCallback(() => setNewCount(0), []);
  return (
    <BoardNotificationContext.Provider value={{ newCount, setNewCount, clearNew }}>
      {children}
    </BoardNotificationContext.Provider>
  );
}

export const useBoardNotification = () => useContext(BoardNotificationContext);
