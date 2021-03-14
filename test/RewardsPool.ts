import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { Contract, ContractFactory, Wallet } from "ethers";
import { ethers } from "hardhat";
import { ETH } from "../tasks/utils";

describe("RewardsPool", () => {
  let RewardsPool: ContractFactory;
  let SyntheticToken: ContractFactory;
  let Boardroom: ContractFactory;
  let stakingToken: Contract;
  let rewardsToken: Contract;
  let pool: Contract;
  let boardroom: Contract;
  let op: SignerWithAddress;
  let other: SignerWithAddress;

  before(async () => {
    RewardsPool = await ethers.getContractFactory("RewardsPool");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
    Boardroom = await ethers.getContractFactory("BoardroomMock");
    const signers = await ethers.getSigners();
    op = signers[0];
    other = signers[1];
  });

  beforeEach(async () => {
    stakingToken = await SyntheticToken.deploy("KLON", "KLON", 18);
    await stakingToken.mint(op.address, ETH.mul(100));
    rewardsToken = await SyntheticToken.deploy("KBTC", "KBTC", 18);
    await rewardsToken.mint(op.address, ETH.mul(100));
    pool = await RewardsPool.deploy(
      "KlonWBTCPool",
      op.address,
      op.address,
      rewardsToken.address,
      stakingToken.address,
      86400 * 5
    );
    boardroom = await Boardroom.deploy();
    await pool.setBoardroom(boardroom.address);
    await stakingToken.approve(pool.address, ethers.constants.MaxUint256);
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

  describe("#stake", () => {
    it("stakes and triggers boardroom update", async () => {
      const amount = 123;
      await expect(pool.stake(amount))
        .to.emit(stakingToken, "Transfer")
        .withArgs(op.address, pool.address, amount)
        .and.to.emit(boardroom, "UpdateAccruals")
        .withArgs(pool.address, op.address);
    });
  });

  describe("#withdraw", () => {
    it("withdraws and triggers boardroom update", async () => {
      const amount = 123;
      await pool.stake(amount);
      await expect(pool.withdraw(12))
        .to.emit(stakingToken, "Transfer")
        .withArgs(pool.address, op.address, 12)
        .and.to.emit(boardroom, "UpdateAccruals")
        .withArgs(pool.address, op.address);
    });
  });

  describe("#setBoardroom", () => {
    it("sets Boardroom", async () => {
      await expect(pool.setBoardroom(other.address))
        .to.emit(pool, "BoardroomChanged")
        .withArgs(op.address, other.address);
      expect(await pool.boardroom()).to.eq(other.address);
    });
    describe("when called not by owner", () => {
      it("fails", async () => {
        await expect(
          pool.connect(other).setBoardroom(other.address)
        ).to.be.revertedWith("Only the contract owner may perform this action");
      });
    });
  });
});
