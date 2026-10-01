const path = require("path");

module.exports = {
  contracts_build_directory: path.join(__dirname, "client/src/contracts"),
  networks: {
    development: {
      network_id: "*",
      host: "127.0.0.1",
      port: 7545, // for ganache gui
      //port: 8545, // for ganache-cli
      gas: 6721975,
      gasPrice: 20000000000,
    },
  },

  // ✅ ADD THIS
  compilers: {
    solc: {
      version: "0.8.20",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
        evmVersion: "paris"
      },
    },
  },
};