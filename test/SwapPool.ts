import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { fastForwardAndMine, now } from "./helpers/helpers";

describe("SwapPool", () => {
  let SwapPool: ContractFactory;
  let SyntheticToken: ContractFactory;

  before(async () => {
    SwapPool = await ethers.getContractFactory("SwapPool");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
  });
  describe("#constructor", () => {
    let inToken: Contract;
    let outToken: Contract;
    before(async () => {
      const [operator] = await ethers.getSigners();
      inToken = await SyntheticToken.deploy("InToken", "IN", 18);
      outToken = await SyntheticToken.deploy("OutToken", "OUT", 18);
      await inToken.mint(operator.address, 10000);
    });
    it("creates a pool", async () => {
      await expect(
        SwapPool.deploy(
          inToken.address,
          outToken.address,
          await now(),
          (await now()) + 100
        )
      ).to.not.be.reverted;
    });
    describe("when `startTime` == 0 and `finishTime` == 0", () => {
      it("fails", async () => {
        await expect(
          SwapPool.deploy(inToken.address, outToken.address, 0, 0)
        ).to.be.revertedWith(
          "Timebound: either start or finish must be nonzero"
        );
      });
    });
    describe("when `finishTime` != 0 and `finishTime` < `startTime`", () => {
      it("fails", async () => {
        await expect(
          SwapPool.deploy(inToken.address, outToken.address, 20, 10)
        ).to.be.revertedWith(
          "Timebound: finish must be zero or greater than start"
        );
      });
    });

    describe("when `startTime` == 0 and `finishTime` > 0", () => {
      it("creates an immediately started pool", async () => {
        const pool = await SwapPool.deploy(
          inToken.address,
          outToken.address,
          0,
          (await now()) + 120
        );
        await inToken.approve(pool.address, 1000);
        await inToken.transferOperator(pool.address);
        await outToken.transferOperator(pool.address);
        await expect(pool.swap(100)).to.not.be.reverted;
      });
    });
    describe("when `startTime` > 0 and `finishTime` == 0", () => {
      it("creates a time unbounded pool", async () => {
        const pool = await SwapPool.deploy(
          inToken.address,
          outToken.address,
          await now(),
          0
        );
        await inToken.approve(pool.address, 1000);
        await inToken.transferOperator(pool.address);
        await outToken.transferOperator(pool.address);
        await pool.swap(100);
        await expect(pool.swap(100)).to.not.be.reverted;
      });
    });
  });
  describe("#swap", () => {
    let inToken: Contract;
    let outToken: Contract;
    let pool: Contract;
    const INITIAL_BALANCE = 10000;
    const FINISH = 3600;
    let op: SignerWithAddress;

    beforeEach(async () => {
      const [operator] = await ethers.getSigners();
      op = operator;
      inToken = await SyntheticToken.deploy("InToken", "IN", 18);
      outToken = await SyntheticToken.deploy("OutToken", "OUT", 18);
      await inToken.mint(operator.address, INITIAL_BALANCE);
      pool = await SwapPool.deploy(
        inToken.address,
        outToken.address,
        0,
        (await now()) + FINISH
      );
      await inToken.transferOperator(pool.address);
      await outToken.transferOperator(pool.address);
      await inToken.approve(pool.address, INITIAL_BALANCE);
    });
    describe("sender allows SwapPool for `inToken`, when `inToken`'s and `outToken`'s operator is SwapPool, SwapPool is started and not finished", () => {
      it("swaps `inToken` for `outToken`", async () => {
        await pool.swap(100);
        expect(
          await inToken.balanceOf(op.address),
          "Invalid inToken balance"
        ).to.eq(INITIAL_BALANCE - 100);
        expect(
          await outToken.balanceOf(op.address),
          "Invalid outToken balance"
        ).to.eq(100);
      });
    });

    describe("when pool is not started", () => {
      it("fails", async () => {
        inToken = await SyntheticToken.deploy("InToken", "IN", 18);
        outToken = await SyntheticToken.deploy("OutToken", "OUT", 18);
        await inToken.mint(op.address, INITIAL_BALANCE);
        pool = await SwapPool.deploy(
          inToken.address,
          outToken.address,
          (await now()) + FINISH,
          (await now()) + FINISH * 2
        );
        await inToken.transferOperator(pool.address);
        await outToken.transferOperator(pool.address);
        await inToken.approve(pool.address, INITIAL_BALANCE);
        await expect(pool.swap(100)).to.be.revertedWith(
          "Timeboundable: Not started yet"
        );
      });
    });
    describe("when pool is finished", () => {
      it("fails", async () => {
        fastForwardAndMine(ethers.provider, FINISH * 2);
        await expect(pool.swap(100)).to.be.revertedWith(
          "Timeboundable: Already finished"
        );
      });
    });
    describe("when not enough balance", () => {
      it("fails", async () => {
        await inToken.approve(pool.address, INITIAL_BALANCE * 100);
        await expect(pool.swap(INITIAL_BALANCE + 1)).to.be.revertedWith(
          "ERC20: burn amount exceeds balance"
        );
      });
    });
    describe("when not enough approved balance", () => {
      it("fails", async () => {
        await inToken.approve(pool.address, Math.floor(INITIAL_BALANCE / 4));
        await expect(
          pool.swap(Math.floor(INITIAL_BALANCE / 2))
        ).to.be.revertedWith("ERC20: burn amount exceeds allowance");
      });
    });
    describe("when pool is not the operator of `inToken`", () => {
      it("fails", async () => {
        inToken = await SyntheticToken.deploy("InToken", "IN", 18);
        outToken = await SyntheticToken.deploy("OutToken", "OUT", 18);
        await inToken.mint(op.address, INITIAL_BALANCE);
        pool = await SwapPool.deploy(
          inToken.address,
          outToken.address,
          0,
          (await now()) + FINISH
        );
        await outToken.transferOperator(pool.address);
        await inToken.approve(pool.address, INITIAL_BALANCE);

        await expect(pool.swap(100)).to.be.revertedWith(
          "Only operator can call this method"
        );
      });
    });
    describe("when pool is not the operator of `outToken`", () => {
      it("fails", async () => {
        inToken = await SyntheticToken.deploy("InToken", "IN", 18);
        outToken = await SyntheticToken.deploy("OutToken", "OUT", 18);
        await inToken.mint(op.address, INITIAL_BALANCE);
        pool = await SwapPool.deploy(
          inToken.address,
          outToken.address,
          0,
          (await now()) + FINISH
        );
        await inToken.transferOperator(pool.address);
        await inToken.approve(pool.address, INITIAL_BALANCE);

        await expect(pool.swap(100)).to.be.revertedWith(
          "Only operator can call this method"
        );
      });
    });
  });
});
