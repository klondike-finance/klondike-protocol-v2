import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { ETH, fastForwardAndMine, now } from "./helpers/helpers";

describe("Boardroom", () => {
  const BOOST_FACTOR = 4;
  const BOOST_DENOMINATOR = 2;

  let Boardroom: ContractFactory;
  let SyntheticToken: ContractFactory;
  let LockPool: ContractFactory;
  let TokenManagerMock: ContractFactory;
  let boardroom: Contract;
  let lockPool: Contract;
  let base: Contract;
  let boost: Contract;
  let tokenManagerMock: Contract;
  let kbtc: Contract;
  let keth: Contract;
  let op: SignerWithAddress;
  let emissionManagerMock: SignerWithAddress;
  let staker0: SignerWithAddress;
  let staker1: SignerWithAddress;
  let staker2: SignerWithAddress;
  let staker3: SignerWithAddress;
  let signers: SignerWithAddress[];

  before(async () => {
    signers = await ethers.getSigners();
    op = signers[0];
    emissionManagerMock = signers[1];
    staker0 = signers[2];
    staker1 = signers[3];
    staker2 = signers[4];
    staker3 = signers[5];
    Boardroom = await ethers.getContractFactory("Boardroom");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
    LockPool = await ethers.getContractFactory("LockPool");
    TokenManagerMock = await ethers.getContractFactory("TokenManagerMock");
  });
  beforeEach(async () => {
    base = await SyntheticToken.deploy("DROID", "DROID", 18);
    boost = await SyntheticToken.deploy("JEDI", "JEDI", 18);
    await base.mint(op.address, ETH.mul(100));
    await boost.mint(op.address, ETH.mul(100));
    lockPool = await LockPool.deploy(base.address, boost.address, await now());
    await boost.transferOperator(lockPool.address);
    await boost.transferOwnership(lockPool.address);
    await base.approve(lockPool.address, ethers.constants.MaxUint256);
    await lockPool.setRewardFactor(7, 100);
    await lockPool.setRewardFactor(30, 150);
    await lockPool.setRewardFactor(90, 200);
    await lockPool.setRewardFactor(180, 250);
    await lockPool.setRewardFactor(365, 300);
    await lockPool.setRewardFactor(1460, 450);
    kbtc = await SyntheticToken.deploy("KBTC", "KBTC", 18);
    keth = await SyntheticToken.deploy("KETH", "KETH", 18);
    await kbtc.mint(op.address, ETH.mul(100));
    await keth.mint(op.address, ETH.mul(100));
    tokenManagerMock = await TokenManagerMock.deploy();
    await tokenManagerMock.addToken(kbtc.address);
    await tokenManagerMock.addToken(keth.address);
    boardroom = await createBoardroom();
    await base.approve(boardroom.address, ethers.constants.MaxUint256);
    await boost.approve(boardroom.address, ethers.constants.MaxUint256);
    await lockPool.setBoardroom(boardroom.address);
  });

  async function createBoardroom() {
    return await Boardroom.deploy(
      base.address,
      boost.address,
      tokenManagerMock.address,
      emissionManagerMock.address,
      lockPool.address,
      BOOST_FACTOR,
      BOOST_DENOMINATOR,
      await now()
    );
  }

  describe("#constructor", () => {
    it("creates Boardroom", async () => {
      await expect(
        Boardroom.deploy(
          base.address,
          boost.address,
          tokenManagerMock.address,
          emissionManagerMock.address,
          lockPool.address,
          BOOST_FACTOR,
          BOOST_DENOMINATOR,
          await now()
        )
      ).to.not.be.reverted;
    });
    describe("when base and boost decimals are different", () => {
      it("fails", async () => {
        base = await SyntheticToken.deploy("DROID", "DROID", 17);
        boost = await SyntheticToken.deploy("JEDI", "JEDI", 18);
        await expect(createBoardroom()).to.be.revertedWith(
          "Boardroom: Base and Boost decimals must be equal"
        );
      });
    });
  });

  describe("#rewardsTokenBalance", () => {
    describe("when only base token is staked", () => {
      it("returns reward token equal to base token", async () => {
        const amount = 12345;
        await boardroom.stake(amount, 0);
        expect(await boardroom.rewardsTokenBalance(op.address)).to.eq(amount);
      });
    });
    describe("when base token is staked and locked in the lockPool", () => {
      it("returns reward token equal to sum of tokens", async () => {
        const amount = 12345;
        const amountLock = 23456;
        await boardroom.stake(amount, 0);
        await lockPool.lock(amountLock, 7);
        expect(await boardroom.rewardsTokenBalance(op.address)).to.eq(
          amount + amountLock
        );
      });
    });
    describe("when boost token is staked", () => {
      it("returns 0", async () => {
        const amount = 12345;
        await boardroom.stake(0, amount);
        expect(await boardroom.rewardsTokenBalance(op.address)).to.eq(0);
      });
    });
    describe("when base and boost token is staked", () => {
      it("returns base + boostFactor * min(base, boost / boostDenominator)", async () => {
        for (let i = 0; i < 20; i++) {
          const amountBase = Math.floor(Math.random() * 10000);
          const amountLock = Math.floor(Math.random() * 10000);
          const amountBoost =
            Math.floor(Math.random() * 10000) *
            (Math.random() < 0.5 ? BOOST_DENOMINATOR : 1);
          const actualAmountLock = (await lockPool.totalLocked(op.address))
            .add(amountLock)
            .toNumber();
          const expectedBalance =
            amountBase +
            actualAmountLock +
            BOOST_FACTOR *
              Math.min(
                amountBase + actualAmountLock,
                Math.floor(amountBoost / BOOST_DENOMINATOR)
              );
          await boardroom.stake(amountBase, amountBoost);
          await lockPool.lock(amountLock, 30);

          expect(await boardroom.rewardsTokenBalance(op.address)).to.eq(
            expectedBalance
          );
          await boardroom.withdraw(amountBase, amountBoost);
        }
      });
    });
  });

  describe("#stake", () => {
    it("stakes base and boost tokens", async () => {
      const baseAmount = 123456;
      const boostAmount = 32;

      await boardroom.stake(baseAmount, 0);
      expect(await boardroom.baseTokenBalances(op.address)).to.eq(baseAmount);

      await boardroom.stake(0, boostAmount);
      expect(await boardroom.boostTokenBalances(op.address)).to.eq(boostAmount);

      await boardroom.stake(baseAmount, boostAmount);
      expect(await boardroom.baseTokenBalances(op.address)).to.eq(
        baseAmount * 2
      );
      expect(await boardroom.boostTokenBalances(op.address)).to.eq(
        boostAmount * 2
      );
    });

    describe("when both amounts are 0", () => {
      it("fails", async () => {
        await expect(boardroom.stake(0, 0)).to.be.revertedWith(
          "Boardroom: one amount should be > 0"
        );
      });
    });

    describe("when there's not enough balance to stake", () => {
      it("fails", async () => {
        await boost.transfer(staker0.address, 1235);
        const baseBalance = await base.balanceOf(op.address);
        const boostBalance = await boost.balanceOf(op.address);

        await expect(boardroom.stake(baseBalance + 1, 0)).to.be.revertedWith(
          "ERC20: transfer amount exceeds balance"
        );
        await expect(boardroom.stake(boostBalance + 1, 0)).to.be.revertedWith(
          "ERC20: transfer amount exceeds balance"
        );

        await expect(boardroom.stake(baseBalance, 0))
          .to.emit(boardroom, "BaseStaked")
          .withArgs(op.address, baseBalance);
        await expect(boardroom.stake(0, boostBalance))
          .to.emit(boardroom, "BoostStaked")
          .withArgs(op.address, boostBalance);
        expect(await base.balanceOf(op.address)).to.eq(0);
        expect(await boost.balanceOf(op.address)).to.eq(0);
      });
    });

    describe("when balance is not approved", () => {
      it("fails", async () => {
        await boost.transfer(staker0.address, 1235);
        const baseBalance = await base.balanceOf(op.address);
        const boostBalance = await boost.balanceOf(op.address);
        await base.approve(boardroom.address, baseBalance.sub(1));
        await boost.approve(boardroom.address, boostBalance.sub(1));

        await expect(boardroom.stake(baseBalance, 0)).to.be.revertedWith(
          "ERC20: transfer amount exceeds allowance"
        );
        await expect(boardroom.stake(0, boostBalance)).to.be.revertedWith(
          "ERC20: transfer amount exceeds allowance"
        );

        await base.approve(boardroom.address, baseBalance);
        await boost.approve(boardroom.address, boostBalance);

        await expect(boardroom.stake(baseBalance, 0))
          .to.emit(boardroom, "BaseStaked")
          .withArgs(op.address, baseBalance);
        await expect(boardroom.stake(0, boostBalance))
          .to.emit(boardroom, "BoostStaked")
          .withArgs(op.address, boostBalance);
        expect(await base.balanceOf(op.address)).to.eq(0);
        expect(await boost.balanceOf(op.address)).to.eq(0);
      });
    });

    describe("when boardroom is paused", () => {
      it("fails", async () => {
        await boardroom.setPause(true);
        await expect(boardroom.stake(123, 0)).to.be.revertedWith(
          "Boardroom operations are paused"
        );
      });
    });
  });

  describe("#withdraw", () => {
    it("withdraws available funds", async () => {
      const baseBalance = await base.balanceOf(op.address);
      const boostBalance = await boost.balanceOf(op.address);
      const baseAmount = 123456;
      const boostAmount = 32;

      await boardroom.stake(baseAmount, boostAmount);
      await expect(boardroom.withdraw(baseAmount / 2, boostAmount / 2))
        .to.emit(boardroom, "BaseWithdrawn")
        .withArgs(op.address, baseAmount / 2)
        .and.emit(boardroom, "BoostWithdrawn")
        .withArgs(op.address, boostAmount / 2);
      await expect(boardroom.withdraw(baseAmount / 2, 0))
        .to.emit(boardroom, "BaseWithdrawn")
        .withArgs(op.address, baseAmount / 2);
      await expect(boardroom.withdraw(0, boostAmount / 2))
        .to.emit(boardroom, "BoostWithdrawn")
        .withArgs(op.address, boostAmount / 2);

      expect(await base.balanceOf(op.address)).to.eq(baseBalance);
      expect(await boost.balanceOf(op.address)).to.eq(boostBalance);
    });

    describe("when limits are overflown", () => {
      it("fails", async () => {
        const baseAmount = 123456;
        const boostAmount = 32;

        await boardroom.stake(baseAmount, boostAmount);
        await expect(boardroom.withdraw(baseAmount + 1, 0)).to.be.revertedWith(
          "SafeMath: subtraction overflow"
        );
        await expect(boardroom.withdraw(0, boostAmount + 1)).to.be.revertedWith(
          "SafeMath: subtraction overflow"
        );
      });
    });
    describe("when both amounts are 0", () => {
      it("fails", async () => {
        const baseAmount = 123456;
        const boostAmount = 32;

        await boardroom.stake(baseAmount, boostAmount);
        await expect(boardroom.withdraw(0, 0)).to.be.revertedWith(
          "Boardroom: one amount should be > 0"
        );
      });
    });
  });

  describe("#updateAccruals", () => {
    async function randomlyAccrueReward(probabality: number) {
      const stakers = [staker0, staker1, staker2, staker3];
      for (const staker of stakers) {
        if (Math.random() < probabality) {
          await boardroom.connect(staker).updateAccruals();
        }
      }
    }

    async function basicTest(probability: number) {
      const tick = 86400;
      const stakers = [staker0, staker1, staker2, staker3];
      for (const staker of stakers) {
        await base.transfer(staker.address, 1000);
        await base
          .connect(staker)
          .approve(boardroom.address, ethers.constants.MaxUint256);
      }

      // day 1
      await boardroom.connect(staker0).stake(100, 0);
      await boardroom.connect(staker1).stake(100, 0);
      await fastForwardAndMine(ethers.provider, tick);
      await randomlyAccrueReward(probability);
      // day 2
      await kbtc.transfer(boardroom.address, 20000);
      await keth.transfer(boardroom.address, 2000);
      await boardroom
        .connect(emissionManagerMock)
        .notifyTransfer(kbtc.address, 20000);
      await boardroom
        .connect(emissionManagerMock)
        .notifyTransfer(keth.address, 2000);
      await fastForwardAndMine(ethers.provider, tick);
      await randomlyAccrueReward(probability);
      // day 3
      await boardroom.connect(staker2).stake(50, 0);
      await fastForwardAndMine(ethers.provider, tick);
      await randomlyAccrueReward(probability);
      // day 4
      await kbtc.transfer(boardroom.address, 30000);
      await keth.transfer(boardroom.address, 3000);
      await boardroom
        .connect(emissionManagerMock)
        .notifyTransfer(kbtc.address, 30000);
      await boardroom
        .connect(emissionManagerMock)
        .notifyTransfer(keth.address, 3000);
      await fastForwardAndMine(ethers.provider, tick);
      await randomlyAccrueReward(probability);
      // day 5
      await boardroom.connect(staker3).stake(150, 0);
      await fastForwardAndMine(ethers.provider, tick);
      await randomlyAccrueReward(probability);
      // day 6
      await kbtc.transfer(boardroom.address, 20000);
      await keth.transfer(boardroom.address, 2000);
      await boardroom
        .connect(emissionManagerMock)
        .notifyTransfer(kbtc.address, 20000);
      await boardroom
        .connect(emissionManagerMock)
        .notifyTransfer(keth.address, 2000);
      await fastForwardAndMine(ethers.provider, tick);
      await randomlyAccrueReward(probability);
      // day 7
      await kbtc.transfer(boardroom.address, 20000);
      await keth.transfer(boardroom.address, 2000);
      await boardroom
        .connect(emissionManagerMock)
        .notifyTransfer(kbtc.address, 20000);
      await boardroom
        .connect(emissionManagerMock)
        .notifyTransfer(keth.address, 2000);
      await fastForwardAndMine(ethers.provider, tick);
      await randomlyAccrueReward(probability);
      // final day
      for (const staker of stakers) {
        await boardroom.connect(staker).updateAccruals();
      }

      // staker0
      expect(
        (await boardroom.personRewardAccruals(kbtc.address, staker0.address))[1]
      ).to.eq(BigNumber.from(32000));
      expect(
        (await boardroom.personRewardAccruals(keth.address, staker0.address))[1]
      ).to.eq(BigNumber.from(3200));

      // staker1
      expect(
        (await boardroom.personRewardAccruals(kbtc.address, staker1.address))[1]
      ).to.eq(BigNumber.from(32000));
      expect(
        (await boardroom.personRewardAccruals(keth.address, staker1.address))[1]
      ).to.eq(BigNumber.from(3200));

      // staker2
      expect(
        (await boardroom.personRewardAccruals(kbtc.address, staker2.address))[1]
      ).to.eq(BigNumber.from(11000));
      expect(
        (await boardroom.personRewardAccruals(keth.address, staker2.address))[1]
      ).to.eq(BigNumber.from(1100));

      // staker3
      expect(
        (await boardroom.personRewardAccruals(kbtc.address, staker3.address))[1]
      ).to.eq(BigNumber.from(15000));
      expect(
        (await boardroom.personRewardAccruals(keth.address, staker3.address))[1]
      ).to.eq(BigNumber.from(1500));
    }
    it("works in basic case with update at the end", async () => {
      await basicTest(0);
    });
    it("works in basic case with random updates", async () => {
      await basicTest(0.3);
    });
    it("works in basic case with each day updates", async () => {
      await basicTest(1);
    });

    it("works with random stakes and rewards", async () => {
      const tick = 86400;
      const stakers = [staker0, staker1, staker2, staker3];
      for (const staker of stakers) {
        await base.transfer(staker.address, 10000);
        await base
          .connect(staker)
          .approve(boardroom.address, ethers.constants.MaxUint256);
      }

      const rewards = [0, 0, 0, 0];
      const stakesAcc = [0, 0, 0, 0];
      for (let i = 0; i < 10; i++) {
        const stakes = [
          Math.random(),
          Math.random(),
          Math.random(),
          Math.random(),
        ].map((x) => Math.floor(x * 100) + 1);
        for (let k = 0; k < 4; k++) {
          stakesAcc[k] += stakes[k];
        }
        const totalStakes = stakesAcc.reduce((acc, val) => acc + val);
        const reward = Math.floor(Math.random() * 10000);
        for (let j = 0; j < 4; j++) {
          await boardroom.connect(stakers[j]).stake(stakes[j], 0);
          rewards[j] += Math.floor((stakesAcc[j] * reward) / totalStakes);
        }
        await fastForwardAndMine(ethers.provider, tick);
        await boardroom
          .connect(emissionManagerMock)
          .notifyTransfer(kbtc.address, reward);
        for (let j = 0; j < 4; j++) {
          await boardroom.connect(stakers[j]).updateAccruals();
        }
      }
      for (let m = 0; m < 4; m++) {
        expect(
          (
            await boardroom.personRewardAccruals(
              kbtc.address,
              stakers[m].address
            )
          )[1]
        ).to.eq(BigNumber.from(rewards[m]));
      }
    });

    describe("when paused", () => {
      it("fails", async () => {
        await boardroom.setPause(true);
        await expect(boardroom.updateAccruals()).to.be.revertedWith(
          "Boardroom operations are paused"
        );
      });
    });
  });

  describe("#claimRewards", () => {
    it("transfers all accrued rewards to owner", async () => {
      const tick = 86400;
      const stakers = [staker0, staker1, staker2, staker3];
      for (const staker of stakers) {
        await base.transfer(staker.address, 1000);
        await base
          .connect(staker)
          .approve(boardroom.address, ethers.constants.MaxUint256);
      }

      // day 1
      await boardroom.connect(staker0).stake(100, 0);
      await boardroom.connect(staker1).stake(300, 0);
      await fastForwardAndMine(ethers.provider, tick);
      // day 2
      await kbtc.transfer(boardroom.address, 20000);
      await keth.transfer(boardroom.address, 2000);
      await boardroom
        .connect(emissionManagerMock)
        .notifyTransfer(kbtc.address, 20000);
      await boardroom
        .connect(emissionManagerMock)
        .notifyTransfer(keth.address, 2000);
      await boardroom.connect(staker0).updateAccruals();
      await boardroom.connect(staker1).updateAccruals();
      expect(await kbtc.balanceOf(boardroom.address)).to.eq(20000);
      expect(await keth.balanceOf(boardroom.address)).to.eq(2000);
      expect(await kbtc.balanceOf(staker0.address)).to.eq(0);
      expect(await keth.balanceOf(staker0.address)).to.eq(0);
      expect(await kbtc.balanceOf(staker1.address)).to.eq(0);
      expect(await keth.balanceOf(staker1.address)).to.eq(0);

      await expect(boardroom.connect(staker0).claimRewards())
        .to.emit(boardroom, "RewardPaid")
        .withArgs(kbtc.address, staker0.address, 5000)
        .and.to.emit(boardroom, "RewardPaid")
        .withArgs(keth.address, staker0.address, 500);
      await expect(boardroom.connect(staker1).claimRewards())
        .to.emit(boardroom, "RewardPaid")
        .withArgs(kbtc.address, staker1.address, 15000)
        .and.to.emit(boardroom, "RewardPaid")
        .withArgs(keth.address, staker1.address, 1500);

      expect(
        (await boardroom.personRewardAccruals(kbtc.address, staker0.address))[1]
      ).to.eq(BigNumber.from(0));
      expect(
        (await boardroom.personRewardAccruals(keth.address, staker0.address))[1]
      ).to.eq(BigNumber.from(0));
      expect(
        (await boardroom.personRewardAccruals(kbtc.address, staker1.address))[1]
      ).to.eq(BigNumber.from(0));
      expect(
        (await boardroom.personRewardAccruals(keth.address, staker1.address))[1]
      ).to.eq(BigNumber.from(0));

      expect(await kbtc.balanceOf(staker0.address)).to.eq(5000);
      expect(await keth.balanceOf(staker0.address)).to.eq(500);
      expect(await kbtc.balanceOf(staker1.address)).to.eq(15000);
      expect(await keth.balanceOf(staker1.address)).to.eq(1500);

      expect(await kbtc.balanceOf(boardroom.address)).to.eq(0);
      expect(await keth.balanceOf(boardroom.address)).to.eq(0);

      await boardroom.connect(staker0).claimRewards();
      await boardroom.connect(staker1).claimRewards();

      expect(await kbtc.balanceOf(staker0.address)).to.eq(5000);
      expect(await keth.balanceOf(staker0.address)).to.eq(500);
      expect(await kbtc.balanceOf(staker1.address)).to.eq(15000);
      expect(await keth.balanceOf(staker1.address)).to.eq(1500);
    });
    describe("when paused", () => {
      it("fails", async () => {
        await boardroom.setPause(true);
        await expect(boardroom.claimRewards()).to.be.revertedWith(
          "Boardroom operations are paused"
        );
      });
    });
  });

  describe("#notifyTransfer", () => {
    it("adds a reward snapshot", async () => {
      const tick = 86400;
      const stakers = [staker0, staker1, staker2, staker3];
      for (const staker of stakers) {
        await base.transfer(staker.address, 1000);
        await base
          .connect(staker)
          .approve(boardroom.address, ethers.constants.MaxUint256);
      }

      // day 1
      await boardroom.connect(staker0).stake(100, 0);
      await fastForwardAndMine(ethers.provider, tick);
      // day 2
      await kbtc.transfer(boardroom.address, 20000);
      await expect(
        boardroom
          .connect(emissionManagerMock)
          .notifyTransfer(kbtc.address, 20000)
      )
        .to.emit(boardroom, "IncomingBoardroomReward")
        .withArgs(kbtc.address, emissionManagerMock.address, 20000);
      const [_, actualReward, actualRPSU] = await boardroom.poolRewardSnapshots(
        kbtc.address,
        1
      );
      expect(actualReward).to.eq(20000);
      expect(actualRPSU).to.eq(
        BigNumber.from(200).mul(BigNumber.from(10).pow(18))
      );
    });
    describe("when called not by EmissionManager", () => {
      it("fails", async () => {
        const tick = 86400;
        const stakers = [staker0, staker1, staker2, staker3];
        for (const staker of stakers) {
          await base.transfer(staker.address, 1000);
          await base
            .connect(staker)
            .approve(boardroom.address, ethers.constants.MaxUint256);
        }

        // day 1
        await boardroom.connect(staker0).stake(100, 0);
        await fastForwardAndMine(ethers.provider, tick);
        // day 2
        await kbtc.transfer(boardroom.address, 20000);
        await expect(
          boardroom.notifyTransfer(kbtc.address, 20000)
        ).to.be.revertedWith(
          "Boardroom: can only be called by EmissionManager"
        );
      });
    });

    describe("when 0 is staked", () => {
      it("fails", async () => {
        await kbtc.transfer(boardroom.address, 20000);
        await expect(
          boardroom
            .connect(emissionManagerMock)
            .notifyTransfer(kbtc.address, 20000)
        ).to.be.revertedWith(
          "Boardroom: Cannot receive incoming reward when token balance is 0"
        );
      });
    });
  });

  describe("#updateRewardsAfterLock", () => {
    describe("when called by LockPool", () => {
      it("updates rewards share", async () => {
        const stakers = [staker0, staker1, staker2, staker3];
        for (const staker of stakers) {
          await base.transfer(staker.address, 1000);
          await base
            .connect(staker)
            .approve(lockPool.address, ethers.constants.MaxUint256);
        }
        await lockPool.lock(1000, 7);
        expect(await boardroom.rewardTokenBalances(op.address)).to.eq(1000);
      });
    });
    describe("when called not by LockPool", () => {
      it("fails", async () => {
        await expect(
          boardroom.updateRewardsAfterLock(op.address)
        ).to.be.revertedWith("Boardroom: can only be called by LockPool");
      });
    });
  });

  describe("#setLockPool, #setBase, #setBoost, #setTokenManager, #setEmissionManager", () => {
    describe("when called by Owner", () => {
      it("succeeds", async () => {
        await expect(boardroom.setLockPool(op.address)).to.not.be.reverted;
        await expect(boardroom.setBase(op.address)).to.not.be.reverted;
        await expect(boardroom.setBoost(op.address)).to.not.be.reverted;
        await expect(boardroom.setTokenManager(op.address)).to.not.be.reverted;
        await expect(boardroom.setEmissionManager(op.address)).to.not.be
          .reverted;
      });
    });
    describe("when called not by Owner", () => {
      it("fails", async () => {
        await boardroom.transferOwnership(staker0.address);
        await expect(boardroom.setLockPool(op.address)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
        await expect(boardroom.setBase(op.address)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
        await expect(boardroom.setBoost(op.address)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
        await expect(boardroom.setTokenManager(op.address)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
        await expect(
          boardroom.setEmissionManager(op.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#setPause", () => {
    describe("when called by Operator", () => {
      it("succeeds", async () => {
        await expect(boardroom.setPause(true)).to.not.be.reverted;
      });
    });
    describe("when called not by Operator", () => {
      it("fails", async () => {
        await boardroom.transferOperator(staker0.address);
        await expect(boardroom.setPause(true)).to.be.revertedWith(
          "Only operator can call this method"
        );
      });
    });
  });
});
