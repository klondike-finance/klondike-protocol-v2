import { expect } from "chai";
import { ContractFactory, Wallet } from "ethers";
import { ethers } from "hardhat";

describe("RewardsPool", () => {
  let RewardsPool: ContractFactory;

  before(async () => {
    RewardsPool = await ethers.getContractFactory("RewardsPool");
  });

  describe("contstuctor", () => {
    it("sets parameters correctly", async () => {
      const name = "KBTCWBTCPool";
      const stakingToken = Wallet.createRandom().address;
      const rewardsToken = Wallet.createRandom().address;
      const rewardsDistribution = Wallet.createRandom().address;
      const rewardsDuration = 86400 * 5;
      const stableTokenPool = await RewardsPool.deploy(
        name,
        rewardsDistribution,
        rewardsDistribution,
        rewardsToken,
        stakingToken,
        rewardsDuration
      );
      expect(await stableTokenPool.name(), "Invalid name").to.eq(name);

      expect(
        await stableTokenPool.stakingToken(),
        "Invalid stakingToken"
      ).to.eq(stakingToken);
      expect(
        await stableTokenPool.rewardsToken(),
        "Invalid rewardsToken"
      ).to.eq(rewardsToken);
      expect(
        await stableTokenPool.rewardsDistribution(),
        "Invalid rewardsDistribution"
      ).to.eq(rewardsDistribution);
      expect(
        await stableTokenPool.rewardsDuration(),
        "Invalid rewardsDuration"
      ).to.eq(rewardsDuration);
    });
  });
});
