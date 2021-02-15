import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { ETH, now } from "./helpers/helpers";

describe("Boardroom", () => {
  const BOOST_FACTOR = 4;
  const BOOST_DENOMINATOR = 2;

  let Boardroom: ContractFactory;
  let SyntheticToken: ContractFactory;
  let LockPool: ContractFactory;
  let TokenManagerMock: ContractFactory;
  let EmissionManager: ContractFactory;
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
    EmissionManager = await ethers.getContractFactory("EmissionManager");
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
});
