import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { ETH, fastForwardAndMine, now } from "./helpers/helpers";

describe("LockPool", () => {
  let op: SignerWithAddress;
  let LockPool: ContractFactory;
  let SyntheticToken: ContractFactory;
  let droid: Contract;
  let jedi: Contract;
  let lockPool: Contract;

  before(async () => {
    const [operator] = await ethers.getSigners();
    op = operator;
    LockPool = await ethers.getContractFactory("LockPool");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
  });
  beforeEach(async () => {
    droid = await SyntheticToken.deploy("DROID", "DROID", 18);
    jedi = await SyntheticToken.deploy("JEDI", "JEDI", 18);
    await droid.mint(op.address, ETH.mul(100));
    await jedi.mint(op.address, ETH.mul(100));
    lockPool = await LockPool.deploy(droid.address, jedi.address, await now());
    await jedi.transferOperator(lockPool.address);
    await droid.approve(lockPool.address, ethers.constants.MaxUint256);
    await lockPool.setRewardFactor(7, 100);
    await lockPool.setRewardFactor(30, 150);
    await lockPool.setRewardFactor(90, 200);
    await lockPool.setRewardFactor(180, 250);
    await lockPool.setRewardFactor(365, 300);
    await lockPool.setRewardFactor(1460, 450);
  });

  // describe("#constructor", () => {
  //   it("creates a new LockPool", async () => {
  //     await expect(LockPool.deploy(droid.address, jedi.address, await now())).to
  //       .not.be.reverted;
  //   });
  // });

  // describe("#validPermissions", () => {
  //   describe("when rewardsToken is managed by LockPool", () => {
  //     it("returns true", async () => {
  //       droid = await SyntheticToken.deploy("DROID", "DROID", 18);
  //       jedi = await SyntheticToken.deploy("JEDI", "JEDI", 18);
  //       lockPool = await LockPool.deploy(
  //         droid.address,
  //         jedi.address,
  //         await now()
  //       );
  //       await jedi.transferOperator(lockPool.address);

  //       expect(await lockPool.validPermissions()).to.eq(true);
  //     });
  //   });
  //   describe("when rewardsToken is not managed by LockPool", () => {
  //     it("returns false", async () => {
  //       droid = await SyntheticToken.deploy("DROID", "DROID", 18);
  //       jedi = await SyntheticToken.deploy("JEDI", "JEDI", 18);
  //       lockPool = await LockPool.deploy(
  //         droid.address,
  //         jedi.address,
  //         await now()
  //       );

  //       expect(await lockPool.validPermissions()).to.eq(false);
  //     });
  //   });
  // });

  // describe("#stakeAvailableForUnlock", () => {
  //   describe("when noting is staked", () => {
  //     it("returns 0", async () => {
  //       expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(0);
  //     });
  //   });
  //   describe("immediately after stake", () => {
  //     it("returns 0", async () => {
  //       await lockPool.lock(10000, 7);
  //       expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(0);
  //     });
  //   });
  //   describe("just before unlock time", () => {
  //     it("returns 0", async () => {
  //       await lockPool.lock(10000, 7);
  //       fastForwardAndMine(ethers.provider, 7 * 86400 - 1);
  //       expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(0);
  //     });
  //   });
  //   describe("just after unlock time", () => {
  //     it("returns amount of tokens", async () => {
  //       await lockPool.lock(10000, 7);
  //       await fastForwardAndMine(ethers.provider, 7 * 86400 + 1);
  //       expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(10000);
  //     });
  //   });
  //   describe("when two tokens are staked", () => {
  //     it("returns proper amounts", async () => {
  //       await lockPool.lock(10000, 7);
  //       // 0
  //       await fastForwardAndMine(ethers.provider, 1000);
  //       // 1000
  //       await lockPool.lock(20000, 30);
  //       // 1001
  //       await fastForwardAndMine(ethers.provider, 7 * 86400 - 1001);
  //       // 7 * 86400
  //       expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(0);

  //       await fastForwardAndMine(ethers.provider, 1);
  //       // 7 * 86400 + 1
  //       expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(10000);

  //       await fastForwardAndMine(ethers.provider, (30 - 7) * 86400 - 1 + 1000);
  //       // 30 * 86400 + 1000
  //       expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(10000);

  //       await fastForwardAndMine(ethers.provider, 2);
  //       // 30 * 86400 + 1002
  //       expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(30000);

  //       await fastForwardAndMine(ethers.provider, 10000000);
  //       // infty
  //       expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(30000);
  //     });
  //   });

  //   describe("when some utxos are used", () => {
  //     it("returns proper amounts", async () => {
  //       await lockPool.lock(10000, 7);
  //       await fastForwardAndMine(ethers.provider, 1000);
  //       // 1000
  //       await lockPool.lock(20000, 30);
  //       await fastForwardAndMine(ethers.provider, 3000);
  //       // 1000
  //       await lockPool.lock(50000, 30);
  //       await fastForwardAndMine(ethers.provider, 86400 * 30 - 4000 + 2000);
  //       expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(30000);
  //       await lockPool.unlock();
  //       expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(0);
  //       await fastForwardAndMine(ethers.provider, 2000);
  //       expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(50000);
  //     });
  //   });
  // });

  describe("#lock", () => {
    describe("all the conditions are good", () => {
      it("locks the tokens and returns the reward", async () => {
        const amount = 123;
        await droid.transfer(
          "0x0000000000000000000000000000000000000001",
          (await droid.balanceOf(op.address)).sub(amount * 7)
        );
        await jedi.transfer(
          "0x0000000000000000000000000000000000000001",
          await jedi.balanceOf(op.address)
        );
        await lockPool.lock(amount, 7);
        expect(await jedi.balanceOf(op.address)).to.eq(
          BigNumber.from(amount).mul(7)
        );
        await jedi.transfer(
          "0x0000000000000000000000000000000000000001",
          await jedi.balanceOf(op.address)
        );

        await lockPool.lock(amount, 30);
        expect(await jedi.balanceOf(op.address)).to.eq(
          BigNumber.from(amount).mul(30).mul(150).div(100)
        );
        await jedi.transfer(
          "0x0000000000000000000000000000000000000001",
          await jedi.balanceOf(op.address)
        );

        await lockPool.lock(amount, 90);
        expect(await jedi.balanceOf(op.address)).to.eq(
          BigNumber.from(amount).mul(90).mul(200).div(100)
        );
        await jedi.transfer(
          "0x0000000000000000000000000000000000000001",
          await jedi.balanceOf(op.address)
        );

        await lockPool.lock(amount, 180);
        expect(await jedi.balanceOf(op.address)).to.eq(
          BigNumber.from(amount).mul(180).mul(250).div(100)
        );
        await jedi.transfer(
          "0x0000000000000000000000000000000000000001",
          await jedi.balanceOf(op.address)
        );

        await lockPool.lock(amount, 365);
        expect(await jedi.balanceOf(op.address)).to.eq(
          BigNumber.from(amount).mul(365).mul(300).div(100)
        );
        await jedi.transfer(
          "0x0000000000000000000000000000000000000001",
          await jedi.balanceOf(op.address)
        );

        await lockPool.lock(amount, 1460);
        expect(await jedi.balanceOf(op.address)).to.eq(
          BigNumber.from(amount).mul(1460).mul(450).div(100)
        );
        expect(await droid.balanceOf(op.address)).to.eq(amount);
      });
    });

    describe("when days param is missing", () => {
      it("fails", async () => {
        await expect(lockPool.lock(123, 31)).to.be.revertedWith(
          "LockPool: Invalid daysLock or amount param"
        );
      });
    });

    describe("when amount is 0", () => {
      it("fails", async () => {
        await expect(lockPool.lock(0, 30)).to.be.revertedWith(
          "LockPool: Invalid daysLock or amount param"
        );
      });
    });

    describe("when contract is not started", () => {
      it("fails", async () => {
        droid = await SyntheticToken.deploy("DROID", "DROID", 18);
        jedi = await SyntheticToken.deploy("JEDI", "JEDI", 18);
        await droid.mint(op.address, ETH.mul(100));
        await jedi.mint(op.address, ETH.mul(100));
        lockPool = await LockPool.deploy(
          droid.address,
          jedi.address,
          (await now()) + 100
        );
        await jedi.transferOperator(lockPool.address);
        await droid.approve(lockPool.address, ethers.constants.MaxUint256);
        await lockPool.setRewardFactor(7, 100);
        await expect(lockPool.lock(100, 30)).to.be.revertedWith(
          "Timeboundable: Not started yet"
        );
      });
    });
  });
});