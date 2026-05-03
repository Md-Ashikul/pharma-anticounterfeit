import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      // Wallet
      walletAddress:   null,
      isConnected:     false,

      // SIWE session
      siweMessage:     null,
      siweSignature:   null,
      isAuthenticated: false,

      // Entity info
      entityRole:      null,
      entityName:      null,

      // Actions
      setWallet: (address) => set({
        walletAddress: address,
        isConnected:   !!address,
      }),

      setSiweSession: (message, signature) => set({
        siweMessage:     message,
        siweSignature:   signature,
        isAuthenticated: !!(message && signature),
      }),

      setEntityInfo: (role, name) => set({
        entityRole: role,
        entityName: name,
      }),

      setGovernment: () => set({
        entityRole: "Government",
        entityName: "Government Authority",
      }),

      logout: () => set({
        walletAddress:   null,
        isConnected:     false,
        siweMessage:     null,
        siweSignature:   null,
        isAuthenticated: false,
        entityRole:      null,
        entityName:      null,
      }),
    }),
    {
      name: "pharma-auth", // localStorage key
      // Only persist these fields — don't persist functions
      partialize: (state) => ({
        walletAddress:   state.walletAddress,
        isConnected:     state.isConnected,
        siweMessage:     state.siweMessage,
        siweSignature:   state.siweSignature,
        isAuthenticated: state.isAuthenticated,
        entityRole:      state.entityRole,
        entityName:      state.entityName,
      }),
    }
  )
);