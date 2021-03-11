import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { ETH, fastForwardAndMine, now } from "./helpers/helpers";

describe("Boardroom", () => {
  let Boardroom: ContractFactory;
  let SyntheticToken: ContractFactory;
  let TokenManagerMock: ContractFactory;
  let boardroom: Contract;
  let klon: Contract;
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
    TokenManagerMock = await ethers.getContractFactory("TokenManagerMock");
  });
  beforeEach(async () => {
    klon = await SyntheticToken.deploy("KLON", "KLON", 18);
    await klon.mint(op.address, ETH.mul(100));
    kbtc = await SyntheticToken.deploy("KBTC", "KBTC", 18);
    keth = await SyntheticToken.deploy("KETH", "KETH", 18);
    await kbtc.mint(op.address, ETH.mul(100));
    await keth.mint(op.address, ETH.mul(100));
    tokenManagerMock = await TokenManagerMock.deploy();
    await tokenManagerMock.addToken(kbtc.address);
    await tokenManagerMock.addToken(keth.address);
    boardroom = await createBoardroom();
    await klon.approve(boardroom.address, ethers.constants.MaxUint256);
  });

  async function createBoardroom() {
    return await Boardroom.deploy(
      klon.address,
      tokenManagerMock.address,
      emissionManagerMock.address,
      await now()
    );
  }

  describe("#constructor", () => {
    it("creates Boardroom", async () => {
      await expect(
        Boardroom.deploy(
          klon.address,
          tokenManagerMock.address,
          emissionManagerMock.address,
          await now()
        )
      ).to.not.be.reverted;
    });
  });

  describe("#shareTokenBalance", () => {
    it("returns klon token staked", async () => {
      const amount = 12345;
      await boardroom.stake(op.address, amount);
      expect(await boardroom.shareTokenBalance(op.address)).to.eq(amount);
    });
  });

  describe("#stake", () => {
    it("stakes klon to specified address", async () => {
      const klonAmount = 123456;
      const initialBalance = await klon.balanceOf(op.address);

      await boardroom.stake(staker0.address, klonAmount);
      expect(await boardroom.stakingTokenBalances(staker0.address)).to.eq(
        klonAmount
      );
      const afterBalance = await klon.balanceOf(op.address);
      expect(initialBalance.sub(afterBalance)).to.eq(klonAmount);
    });

    describe("when amount is 0", () => {
      it("fails", async () => {
        await expect(boardroom.stake(op.address, 0)).to.be.revertedWith(
          "Boardroom: amount should be > 0"
        );
      });
    });

    describe("when there's not enough balance to stake", () => {
      it("fails", async () => {
        const klonBalance = await klon.balanceOf(op.address);

        await expect(
          boardroom.stake(staker0.address, klonBalance + 1)
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        await expect(boardroom.stake(staker0.address, klonBalance))
          .to.emit(boardroom, "Staked")
          .withArgs(op.address, staker0.address, klonBalance);
        expect(await klon.balanceOf(op.address)).to.eq(0);
      });
    });

    describe("when balance is not approved", () => {
      it("fails", async () => {
        const klonBalance = await klon.balanceOf(op.address);
        await klon.approve(boardroom.address, klonBalance.sub(1));

        await expect(
          boardroom.stake(op.address, klonBalance)
        ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
        await klon.approve(boardroom.address, klonBalance);

        await expect(boardroom.stake(staker0.address, klonBalance))
          .to.emit(boardroom, "Staked")
          .withArgs(op.address, staker0.address, klonBalance);
        expect(await klon.balanceOf(op.address)).to.eq(0);
      });
    });

    describe("when boardroom is paused", () => {
      it("fails", async () => {
        await boardroom.setPause(true);
        await expect(boardroom.stake(op.address, 123)).to.be.revertedWith(
          "Boardroom operations are paused"
        );
      });
    });
  });

  describe("#withdraw", () => {
    it("withdraws available funds", async () => {
      const klonBalance = await klon.balanceOf(op.address);
      const klonAmount = 123456;

      await boardroom.stake(op.address, klonAmount);
      await expect(boardroom.withdraw(staker0.address, klonAmount / 2))
        .to.emit(boardroom, "Withdrawn")
        .withArgs(op.address, staker0.address, klonAmount / 2);
      await expect(boardroom.withdraw(op.address, klonAmount / 2))
        .to.emit(boardroom, "Withdrawn")
        .withArgs(op.address, op.address, klonAmount / 2);

      expect(await klon.balanceOf(op.address)).to.eq(
        klonBalance.sub(klonAmount / 2)
      );
    });

    describe("when limits are overflown", () => {
      it("fails", async () => {
        const klonAmount = 123456;

        await boardroom.stake(op.address, klonAmount);
        await expect(
          boardroom.withdraw(op.address, klonAmount + 1)
        ).to.be.revertedWith("SafeMath: subtraction overflow");
      });
    });
    describe("when both amounts are 0", () => {
      it("fails", async () => {
        const klonAmount = 123456;
        const boostAmount = 32;

        await boardroom.stake(op.address, klonAmount);
        await expect(boardroom.withdraw(op.address, 0)).to.be.revertedWith(
          "Boardroom: amount should be > 0"
        );
      });
    });
  });

  // describe("#updateAccruals", () => {
  //   async function randomlyAccrueReward(probabality: number) {
  //     const stakers = [staker0, staker1, staker2, staker3];
  //     for (const staker of stakers) {
  //       if (Math.random() < probabality) {
  //         await boardroom.connect(staker).updateAccruals();
  //       }
  //     }
  //   }

  //   async function basicTest(probability: number) {
  //     const tick = 86400;
  //     const stakers = [staker0, staker1, staker2, staker3];
  //     for (const staker of stakers) {
  //       await klon.transfer(staker.address, 1000);
  //       await klon
  //         .connect(staker)
  //         .approve(boardroom.address, ethers.constants.MaxUint256);
  //     }

  //     // day 1
  //     await boardroom.connect(staker0).stake(100, 0);
  //     await boardroom.connect(staker1).stake(100, 0);
  //     await fastForwardAndMine(ethers.provider, tick);
  //     await randomlyAccrueReward(probability);
  //     // day 2
  //     await kbtc.transfer(boardroom.address, 20000);
  //     await keth.transfer(boardroom.address, 2000);
  //     await boardroom
  //       .connect(emissionManagerMock)
  //       .notifyTransfer(kbtc.address, 20000);
  //     await boardroom
  //       .connect(emissionManagerMock)
  //       .notifyTransfer(keth.address, 2000);
  //     await fastForwardAndMine(ethers.provider, tick);
  //     await randomlyAccrueReward(probability);
  //     // day 3
  //     await boardroom.connect(staker2).stake(50, 0);
  //     await fastForwardAndMine(ethers.provider, tick);
  //     await randomlyAccrueReward(probability);
  //     // day 4
  //     await kbtc.transfer(boardroom.address, 30000);
  //     await keth.transfer(boardroom.address, 3000);
  //     await boardroom
  //       .connect(emissionManagerMock)
  //       .notifyTransfer(kbtc.address, 30000);
  //     await boardroom
  //       .connect(emissionManagerMock)
  //       .notifyTransfer(keth.address, 3000);
  //     await fastForwardAndMine(ethers.provider, tick);
  //     await randomlyAccrueReward(probability);
  //     // day 5
  //     await boardroom.connect(staker3).stake(150, 0);
  //     await fastForwardAndMine(ethers.provider, tick);
  //     await randomlyAccrueReward(probability);
  //     // day 6
  //     await kbtc.transfer(boardroom.address, 20000);
  //     await keth.transfer(boardroom.address, 2000);
  //     await boardroom
  //       .connect(emissionManagerMock)
  //       .notifyTransfer(kbtc.address, 20000);
  //     await boardroom
  //       .connect(emissionManagerMock)
  //       .notifyTransfer(keth.address, 2000);
  //     await fastForwardAndMine(ethers.provider, tick);
  //     await randomlyAccrueReward(probability);
  //     // day 7
  //     await kbtc.transfer(boardroom.address, 20000);
  //     await keth.transfer(boardroom.address, 2000);
  //     await boardroom
  //       .connect(emissionManagerMock)
  //       .notifyTransfer(kbtc.address, 20000);
  //     await boardroom
  //       .connect(emissionManagerMock)
  //       .notifyTransfer(keth.address, 2000);
  //     await fastForwardAndMine(ethers.provider, tick);
  //     await randomlyAccrueReward(probability);
  //     // final day
  //     expect(
  //       await boardroom.availableForWithdraw(kbtc.address, staker0.address)
  //     ).to.eq(32000);
  //     expect(
  //       await boardroom.availableForWithdraw(keth.address, staker0.address)
  //     ).to.eq(3200);
  //     expect(
  //       await boardroom.availableForWithdraw(kbtc.address, staker1.address)
  //     ).to.eq(32000);
  //     expect(
  //       await boardroom.availableForWithdraw(keth.address, staker1.address)
  //     ).to.eq(3200);
  //     expect(
  //       await boardroom.availableForWithdraw(kbtc.address, staker2.address)
  //     ).to.eq(11000);
  //     expect(
  //       await boardroom.availableForWithdraw(keth.address, staker2.address)
  //     ).to.eq(1100);
  //     expect(
  //       await boardroom.availableForWithdraw(kbtc.address, staker3.address)
  //     ).to.eq(15000);
  //     expect(
  //       await boardroom.availableForWithdraw(keth.address, staker3.address)
  //     ).to.eq(1500);

  //     for (const staker of stakers) {
  //       await boardroom.connect(staker).updateAccruals();
  //     }

  //     // staker0
  //     expect(
  //       (await boardroom.personRewardAccruals(kbtc.address, staker0.address))[1]
  //     ).to.eq(BigNumber.from(32000));
  //     expect(
  //       (await boardroom.personRewardAccruals(keth.address, staker0.address))[1]
  //     ).to.eq(BigNumber.from(3200));

  //     // staker1
  //     expect(
  //       (await boardroom.personRewardAccruals(kbtc.address, staker1.address))[1]
  //     ).to.eq(BigNumber.from(32000));
  //     expect(
  //       (await boardroom.personRewardAccruals(keth.address, staker1.address))[1]
  //     ).to.eq(BigNumber.from(3200));

  //     // staker2
  //     expect(
  //       (await boardroom.personRewardAccruals(kbtc.address, staker2.address))[1]
  //     ).to.eq(BigNumber.from(11000));
  //     expect(
  //       (await boardroom.personRewardAccruals(keth.address, staker2.address))[1]
  //     ).to.eq(BigNumber.from(1100));

  //     // staker3
  //     expect(
  //       (await boardroom.personRewardAccruals(kbtc.address, staker3.address))[1]
  //     ).to.eq(BigNumber.from(15000));
  //     expect(
  //       (await boardroom.personRewardAccruals(keth.address, staker3.address))[1]
  //     ).to.eq(BigNumber.from(1500));
  //   }
  //   it("works in basic case with update at the end", async () => {
  //     await basicTest(0);
  //   });
  //   it("works in basic case with random updates", async () => {
  //     await basicTest(0.3);
  //   });
  //   it("works in basic case with each day updates", async () => {
  //     await basicTest(1);
  //   });

  //   it("works with random stakes and rewards", async () => {
  //     const tick = 86400;
  //     const stakers = [staker0, staker1, staker2, staker3];
  //     for (const staker of stakers) {
  //       await klon.transfer(staker.address, 10000);
  //       await klon
  //         .connect(staker)
  //         .approve(boardroom.address, ethers.constants.MaxUint256);
  //     }

  //     const rewards = [0, 0, 0, 0];
  //     const stakesAcc = [0, 0, 0, 0];
  //     for (let i = 0; i < 10; i++) {
  //       const stakes = [
  //         Math.random(),
  //         Math.random(),
  //         Math.random(),
  //         Math.random(),
  //       ].map((x) => Math.floor(x * 100) + 1);
  //       for (let k = 0; k < 4; k++) {
  //         stakesAcc[k] += stakes[k];
  //       }
  //       const totalStakes = stakesAcc.reduce((acc, val) => acc + val);
  //       const reward = Math.floor(Math.random() * 10000);
  //       for (let j = 0; j < 4; j++) {
  //         await boardroom.connect(stakers[j]).stake(stakes[j], 0);
  //         rewards[j] += Math.floor((stakesAcc[j] * reward) / totalStakes);
  //       }
  //       await fastForwardAndMine(ethers.provider, tick);
  //       await boardroom
  //         .connect(emissionManagerMock)
  //         .notifyTransfer(kbtc.address, reward);
  //       for (let j = 0; j < 4; j++) {
  //         await boardroom.connect(stakers[j]).updateAccruals();
  //       }
  //     }
  //     for (let m = 0; m < 4; m++) {
  //       const actual: BigNumber = (
  //         await boardroom.personRewardAccruals(kbtc.address, stakers[m].address)
  //       )[1];
  //       const expected = BigNumber.from(rewards[m]);
  //       const diff = actual.gt(expected)
  //         ? actual.sub(expected)
  //         : expected.sub(actual);

  //       expect(diff.toNumber() <= 1).to.eq(true);
  //     }
  //   });

  //   describe("when paused", () => {
  //     it("fails", async () => {
  //       await boardroom.setPause(true);
  //       await expect(boardroom.updateAccruals()).to.be.revertedWith(
  //         "Boardroom operations are paused"
  //       );
  //     });
  //   });
  // });

  // describe("#claimRewards", () => {
  //   it("transfers all accrued rewards to owner", async () => {
  //     const tick = 86400;
  //     const stakers = [staker0, staker1, staker2, staker3];
  //     for (const staker of stakers) {
  //       await klon.transfer(staker.address, 1000);
  //       await klon
  //         .connect(staker)
  //         .approve(boardroom.address, ethers.constants.MaxUint256);
  //     }

  //     // day 1
  //     await boardroom.connect(staker0).stake(100, 0);
  //     await boardroom.connect(staker1).stake(300, 0);
  //     await fastForwardAndMine(ethers.provider, tick);
  //     // day 2
  //     await kbtc.transfer(boardroom.address, 20000);
  //     await keth.transfer(boardroom.address, 2000);
  //     await boardroom
  //       .connect(emissionManagerMock)
  //       .notifyTransfer(kbtc.address, 20000);
  //     await boardroom
  //       .connect(emissionManagerMock)
  //       .notifyTransfer(keth.address, 2000);
  //     await boardroom.connect(staker0).updateAccruals();
  //     await boardroom.connect(staker1).updateAccruals();
  //     expect(await kbtc.balanceOf(boardroom.address)).to.eq(20000);
  //     expect(await keth.balanceOf(boardroom.address)).to.eq(2000);
  //     expect(await kbtc.balanceOf(staker0.address)).to.eq(0);
  //     expect(await keth.balanceOf(staker0.address)).to.eq(0);
  //     expect(await kbtc.balanceOf(staker1.address)).to.eq(0);
  //     expect(await keth.balanceOf(staker1.address)).to.eq(0);

  //     await expect(boardroom.connect(staker0).claimRewards())
  //       .to.emit(boardroom, "RewardPaid")
  //       .withArgs(kbtc.address, staker0.address, 5000)
  //       .and.to.emit(boardroom, "RewardPaid")
  //       .withArgs(keth.address, staker0.address, 500);
  //     await expect(boardroom.connect(staker1).claimRewards())
  //       .to.emit(boardroom, "RewardPaid")
  //       .withArgs(kbtc.address, staker1.address, 15000)
  //       .and.to.emit(boardroom, "RewardPaid")
  //       .withArgs(keth.address, staker1.address, 1500);

  //     expect(
  //       (await boardroom.personRewardAccruals(kbtc.address, staker0.address))[1]
  //     ).to.eq(BigNumber.from(0));
  //     expect(
  //       (await boardroom.personRewardAccruals(keth.address, staker0.address))[1]
  //     ).to.eq(BigNumber.from(0));
  //     expect(
  //       (await boardroom.personRewardAccruals(kbtc.address, staker1.address))[1]
  //     ).to.eq(BigNumber.from(0));
  //     expect(
  //       (await boardroom.personRewardAccruals(keth.address, staker1.address))[1]
  //     ).to.eq(BigNumber.from(0));

  //     expect(await kbtc.balanceOf(staker0.address)).to.eq(5000);
  //     expect(await keth.balanceOf(staker0.address)).to.eq(500);
  //     expect(await kbtc.balanceOf(staker1.address)).to.eq(15000);
  //     expect(await keth.balanceOf(staker1.address)).to.eq(1500);

  //     expect(await kbtc.balanceOf(boardroom.address)).to.eq(0);
  //     expect(await keth.balanceOf(boardroom.address)).to.eq(0);

  //     await boardroom.connect(staker0).claimRewards();
  //     await boardroom.connect(staker1).claimRewards();

  //     expect(await kbtc.balanceOf(staker0.address)).to.eq(5000);
  //     expect(await keth.balanceOf(staker0.address)).to.eq(500);
  //     expect(await kbtc.balanceOf(staker1.address)).to.eq(15000);
  //     expect(await keth.balanceOf(staker1.address)).to.eq(1500);
  //   });
  //   describe("when paused", () => {
  //     it("fails", async () => {
  //       await boardroom.setPause(true);
  //       await expect(boardroom.claimRewards()).to.be.revertedWith(
  //         "Boardroom operations are paused"
  //       );
  //     });
  //   });
  // });

  // describe("#notifyTransfer", () => {
  //   it("adds a reward snapshot", async () => {
  //     const tick = 86400;
  //     const stakers = [staker0, staker1, staker2, staker3];
  //     for (const staker of stakers) {
  //       await klon.transfer(staker.address, 1000);
  //       await klon
  //         .connect(staker)
  //         .approve(boardroom.address, ethers.constants.MaxUint256);
  //     }

  //     // day 1
  //     await boardroom.connect(staker0).stake(100, 0);
  //     await fastForwardAndMine(ethers.provider, tick);
  //     // day 2
  //     await kbtc.transfer(boardroom.address, 20000);
  //     await expect(
  //       boardroom
  //         .connect(emissionManagerMock)
  //         .notifyTransfer(kbtc.address, 20000)
  //     )
  //       .to.emit(boardroom, "IncomingBoardroomReward")
  //       .withArgs(kbtc.address, emissionManagerMock.address, 20000);
  //     const [_, actualReward, actualRPSU] = await boardroom.poolRewardSnapshots(
  //       kbtc.address,
  //       1
  //     );
  //     expect(actualReward).to.eq(20000);
  //     expect(actualRPSU).to.eq(
  //       BigNumber.from(200).mul(BigNumber.from(10).pow(18))
  //     );
  //   });
  //   describe("when called not by EmissionManager", () => {
  //     it("fails", async () => {
  //       const tick = 86400;
  //       const stakers = [staker0, staker1, staker2, staker3];
  //       for (const staker of stakers) {
  //         await klon.transfer(staker.address, 1000);
  //         await klon
  //           .connect(staker)
  //           .approve(boardroom.address, ethers.constants.MaxUint256);
  //       }

  //       // day 1
  //       await boardroom.connect(staker0).stake(100, 0);
  //       await fastForwardAndMine(ethers.provider, tick);
  //       // day 2
  //       await kbtc.transfer(boardroom.address, 20000);
  //       await expect(
  //         boardroom.notifyTransfer(kbtc.address, 20000)
  //       ).to.be.revertedWith(
  //         "Boardroom: can only be called by EmissionManager"
  //       );
  //     });
  //   });

  //   describe("when 0 is staked", () => {
  //     it("fails", async () => {
  //       await kbtc.transfer(boardroom.address, 20000);
  //       await expect(
  //         boardroom
  //           .connect(emissionManagerMock)
  //           .notifyTransfer(kbtc.address, 20000)
  //       ).to.be.revertedWith(
  //         "Boardroom: Cannot receive incoming reward when token balance is 0"
  //       );
  //     });
  //   });
  // });

  // describe("#updateRewardsAfterLock", () => {
  //   describe("when called by LockPool", () => {
  //     it("updates rewards share", async () => {
  //       const stakers = [staker0, staker1, staker2, staker3];
  //       for (const staker of stakers) {
  //         await klon.transfer(staker.address, 1000);
  //         await klon
  //           .connect(staker)
  //           .approve(lockPool.address, ethers.constants.MaxUint256);
  //       }
  //       await lockPool.lock(1000, 7);
  //       expect(await boardroom.rewardTokenBalances(op.address)).to.eq(1000);
  //     });
  //   });
  //   describe("when called not by LockPool", () => {
  //     it("fails", async () => {
  //       await expect(
  //         boardroom.updateRewardsAfterLock(op.address)
  //       ).to.be.revertedWith("Boardroom: can only be called by LockPool");
  //     });
  //   });
  // });

  // describe("#setLockPool, #setBase, #setBoost, #setTokenManager, #setEmissionManager, #setBoostFactor, #setBoostDenominator", () => {
  //   describe("when called by Owner", () => {
  //     it("succeeds", async () => {
  //       await expect(boardroom.setLockPool(op.address)).to.not.be.reverted;
  //       await expect(boardroom.setBase(op.address)).to.not.be.reverted;
  //       await expect(boardroom.setBoost(op.address)).to.not.be.reverted;
  //       await expect(boardroom.setTokenManager(op.address)).to.not.be.reverted;
  //       await expect(boardroom.setEmissionManager(op.address)).to.not.be
  //         .reverted;
  //       await expect(boardroom.setBoostFactor(105)).to.not.be.reverted;
  //       await expect(boardroom.setBoostDenominator(110)).to.not.be.reverted;
  //     });
  //   });
  //   describe("when called not by Owner", () => {
  //     it("fails", async () => {
  //       await boardroom.transferOwnership(staker0.address);
  //       await expect(boardroom.setLockPool(op.address)).to.be.revertedWith(
  //         "Ownable: caller is not the owner"
  //       );
  //       await expect(boardroom.setBase(op.address)).to.be.revertedWith(
  //         "Ownable: caller is not the owner"
  //       );
  //       await expect(boardroom.setBoost(op.address)).to.be.revertedWith(
  //         "Ownable: caller is not the owner"
  //       );
  //       await expect(boardroom.setBoostFactor(110)).to.be.revertedWith(
  //         "Ownable: caller is not the owner"
  //       );
  //       await expect(boardroom.setBoostDenominator(110)).to.be.revertedWith(
  //         "Ownable: caller is not the owner"
  //       );
  //       await expect(boardroom.setTokenManager(op.address)).to.be.revertedWith(
  //         "Ownable: caller is not the owner"
  //       );
  //       await expect(
  //         boardroom.setEmissionManager(op.address)
  //       ).to.be.revertedWith("Ownable: caller is not the owner");
  //     });
  //   });
  // });

  // describe("#setPause", () => {
  //   describe("when called by Operator", () => {
  //     it("succeeds", async () => {
  //       await expect(boardroom.setPause(true)).to.not.be.reverted;
  //     });
  //   });
  //   describe("when called not by Operator", () => {
  //     it("fails", async () => {
  //       await boardroom.transferOperator(staker0.address);
  //       await expect(boardroom.setPause(true)).to.be.revertedWith(
  //         "Only operator can call this method"
  //       );
  //     });
  //   });
  // });

  // describe("#availableForWithdraw", () => {
  //   describe("when token is not initialized", () => {
  //     it("returns 0", async () => {
  //       expect(
  //         await boardroom.availableForWithdraw(kbtc.address, op.address)
  //       ).to.eq(0);
  //     });
  //   });
  //   describe("when token is initialized, and something is staked", () => {
  //     it("returns distibuted amount", async () => {
  //       const amount = 10000000;
  //       await boardroom.stake(1, 0);
  //       await kbtc.transfer(boardroom.address, amount);
  //       await boardroom
  //         .connect(emissionManagerMock)
  //         .notifyTransfer(kbtc.address, amount);
  //       expect(
  //         await boardroom.availableForWithdraw(kbtc.address, op.address)
  //       ).to.eq(amount);
  //     });
  //   });
  // });
});
