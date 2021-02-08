import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { fastForwardAndMine } from "../helpers/helpers";

// Complex contracts used to aggregate transactions because hardhat network automines on receiving a transaction

describe("ReentrancyGuardable", () => {
  let ReenctrancyTest: ContractFactory;
  let ReenctrancyAggregator: ContractFactory;
  let reenctrancyTest: Contract;
  before(async () => {
    ReenctrancyTest = await ethers.getContractFactory("ReentrancyTest");
    ReenctrancyAggregator = await ethers.getContractFactory(
      "ReentrancyAggregator"
    );
    reenctrancyTest = await ReenctrancyTest.deploy();
  });
  beforeEach(async () => {
    fastForwardAndMine(ethers.provider, 900);
  });
  describe("onePerBlock modifier", () => {
    it("allows to call a function", async () => {
      await expect(reenctrancyTest.test(1)).to.not.be.reverted;
      const reentrancyAggregator = await ReenctrancyAggregator.deploy([
        reenctrancyTest.address,
      ]);
      await expect(reentrancyAggregator.test(1)).to.not.be.reverted;
    });
    describe("when called twice from the same sender", () => {
      it("fails", async () => {
        const reentrancyAggregator = await ReenctrancyAggregator.deploy([
          reenctrancyTest.address,
        ]);
        await expect(reentrancyAggregator.test(2)).to.be.revertedWith(
          "SingleBlock: one function marked as `onePerBlock` was already called in this block by this sender"
        );
      });
    });
    describe("when called twice from the same origin", () => {
      it("fails", async () => {
        const reentrancyAggregator = await ReenctrancyAggregator.deploy([
          reenctrancyTest.address,
        ]);
        const agg2 = await ReenctrancyAggregator.deploy([
          reenctrancyTest.address,
          reentrancyAggregator.address,
        ]);
        await expect(agg2.test(1)).to.be.revertedWith(
          "SingleBlock: one function marked as `onePerBlock` was already called in this block by this origin"
        );
      });
    });
  });
});
