#!/bin/bash
# 1. Store updates
sed -i 's/setIsCoreOnline: (status) => set({ isCoreOnline: status }),/setCoreOnlineStatus: (status) => set({ isCoreOnline: status }),/' src/store/useTicketStore.js

# 2. CoreHealthIndicator updates
sed -i 's/setIsCoreOnline/setCoreOnlineStatus/g' src/components/layout/CoreHealthIndicator.jsx

# 3. ActionProposalBlock updates
sed -i 's/⚠️ Action Vault Offline: Execution suspended due to system connectivity issues./⚠️ AXiM Core Offline: Action execution suspended./' src/components/tickets/ActionProposalBlock.jsx
