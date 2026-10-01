// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Migrations {
  address public owner;
  uint256 public last_completed_migration;

  modifier restricted() {
    require(msg.sender == owner, "Only owner");
    _;
  }

  constructor() {
    owner = msg.sender;
  }

  function setCompleted(uint256 completed) public restricted {
    last_completed_migration = completed;
  }
}