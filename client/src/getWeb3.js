import Web3 from "web3";

const getWeb3 = async () => {
  // ✅ 1. If MetaMask is installed (Best option)
  if (window.ethereum) {
    try {
      const web3 = new Web3(window.ethereum);

      // Request accounts access
      await window.ethereum.request({ method: "eth_requestAccounts" });

      console.log("✅ Connected to MetaMask successfully");
      return web3;
    } catch (error) {
      console.error("❌ User denied MetaMask connection:", error);
      throw error;
    }
  }

  // ✅ 2. Legacy DApp browsers
  else if (window.web3) {
    const web3 = new Web3(window.web3.currentProvider);
    console.warn("⚠️ Using legacy web3 provider.");
    return web3;
  }

  // ✅ 3. LAN / Environment RPC fallback (for hotspot demo)
  else {
    const rpcUrl =
      process.env.REACT_APP_RPC_URL || "http://127.0.0.1:7545";

    try {
      const provider = new Web3.providers.HttpProvider(rpcUrl);
      const web3 = new Web3(provider);

      console.warn(`⚙️ No wallet detected. Using RPC: ${rpcUrl}`);
      return web3;
    } catch (error) {
      console.error("❌ Failed to connect to RPC:", error);
      throw error;
    }
  }
};

export default getWeb3;