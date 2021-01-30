import { expect } from "chai";
import { ContractFactory, Wallet } from "ethers";
import { ethers } from "hardhat";

describe("StableTokenPool", function () {
  let StableTokenPool: ContractFactory;

  before(async () => {
    StableTokenPool = await ethers.getContractFactory("StableTokenPool");
  });

  it("deploys correctly", async () => {
    const name = "KBTCWBTCPool";
    const stakingToken = Wallet.createRandom().address;
    const rewardsToken = Wallet.createRandom().address;
    const rewardsDistribution = Wallet.createRandom().address;
    const rewardsDuration = 86400 * 5;
    const stableTokenPool = await StableTokenPool.deploy(
      name,
      rewardsDistribution,
      rewardsToken,
      stakingToken,
      rewardsDuration
    );
    expect(await stableTokenPool.name(), "Invalid name").to.eq(name);

    expect(await stableTokenPool.stakingToken(), "Invalid stakingToken").to.eq(
      stakingToken
    );
    expect(await stableTokenPool.rewardsToken(), "Invalid rewardsToken").to.eq(
      rewardsToken
    );
    expect(
      await stableTokenPool.rewardsDistribution(),
      "Invalid rewardsDistribution"
    ).to.eq(rewardsDistribution);
    expect(
      await stableTokenPool.rewardsDuration(),
      "Invalid rewardsDuration"
    ).to.eq(rewardsDuration);
  });

  it("disables setRewardsDuration", async () => {
    const name = "KBTCWBTCPool";
    const stakingToken = Wallet.createRandom().address;
    const rewardsToken = Wallet.createRandom().address;
    const rewardsDistribution = Wallet.createRandom().address;
    const rewardsDuration = 86400 * 5;
    const stableTokenPool = await StableTokenPool.deploy(
      name,
      rewardsDistribution,
      rewardsToken,
      stakingToken,
      rewardsDuration
    );
    await expect(stableTokenPool.setRewardsDuration(86400)).to.revertedWith(
      "Disabled"
    );
  });
});
