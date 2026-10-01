const Election = artifacts.require("Election");

module.exports = function (deployer) {
  deployer.deploy(
    Election,
    "DIGIVOTE 2026",          // Election Name
    "Blockchain Based Voting System"  // Description
  );
};