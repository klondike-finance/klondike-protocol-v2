import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { ETH, fastForwardAndMine, now } from "./helpers/helpers";

describe("LockPool", () => {
  let op: SignerWithAddress;
  let LockPool: ContractFactory;
  let SyntheticToken: ContractFactory;
  let BoardroomMock: ContractFactory;
  let droid: Contract;
  let jedi: Contract;
  let lockPool: Contract;
  let boardroomMock: Contract;

  before(async () => {
    const [operator] = await ethers.getSigners();
    op = operator;
    LockPool = await ethers.getContractFactory("LockPool");
    BoardroomMock = await ethers.getContractFactory("BoardroomMock");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
  });
  beforeEach(async () => {
    boardroomMock = await BoardroomMock.deploy();
    droid = await SyntheticToken.deploy("DROID", "DROID", 18);
    jedi = await SyntheticToken.deploy("JEDI", "JEDI", 18);
    await droid.mint(op.address, ETH.mul(100));
    await jedi.mint(op.address, ETH.mul(100));
    lockPool = await LockPool.deploy(droid.address, jedi.address, await now());
    await jedi.transferOperator(lockPool.address);
    await jedi.transferOwnership(lockPool.address);
    await droid.approve(lockPool.address, ethers.constants.MaxUint256);

    await lockPool.setRewardFactor(7, 100);
    await lockPool.setRewardFactor(30, 150);
    await lockPool.setRewardFactor(90, 200);
    await lockPool.setRewardFactor(180, 250);
    await lockPool.setRewardFactor(365, 300);
    await lockPool.setRewardFactor(1460, 450);
    await lockPool.setBoardroom(boardroomMock.address);
  });

  describe("#constructor", () => {
    it("creates a new LockPool", async () => {
      await expect(LockPool.deploy(droid.address, jedi.address, await now())).to
        .not.be.reverted;
    });
  });

  describe("#validPermissions", () => {
    describe("when rewardsToken is managed by LockPool", () => {
      it("returns true", async () => {
        droid = await SyntheticToken.deploy("DROID", "DROID", 18);
        jedi = await SyntheticToken.deploy("JEDI", "JEDI", 18);
        lockPool = await LockPool.deploy(
          droid.address,
          jedi.address,
          await now()
        );
        await jedi.transferOperator(lockPool.address);
        await jedi.transferOwnership(lockPool.address);

        expect(await lockPool.validPermissions()).to.eq(true);
      });
    });
    describe("when rewardsToken is not owned by LockPool", () => {
      it("returns false", async () => {
        droid = await SyntheticToken.deploy("DROID", "DROID", 18);
        jedi = await SyntheticToken.deploy("JEDI", "JEDI", 18);
        lockPool = await LockPool.deploy(
          droid.address,
          jedi.address,
          await now()
        );
        await jedi.transferOperator(lockPool.address);
        expect(await lockPool.validPermissions()).to.eq(false);
      });
    });
    describe("when rewardsToken is not operated by LockPool", () => {
      it("returns false", async () => {
        droid = await SyntheticToken.deploy("DROID", "DROID", 18);
        jedi = await SyntheticToken.deploy("JEDI", "JEDI", 18);
        lockPool = await LockPool.deploy(
          droid.address,
          jedi.address,
          await now()
        );
        await jedi.transferOwnership(lockPool.address);
        expect(await lockPool.validPermissions()).to.eq(false);
      });
    });
  });

  describe("#stakeAvailableForUnlock", () => {
    describe("when noting is staked", () => {
      it("returns 0", async () => {
        expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(0);
      });
    });
    describe("immediately after stake", () => {
      it("returns 0", async () => {
        await lockPool.lock(10000, 7);
        expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(0);
      });
    });
    describe("just before unlock time", () => {
      it("returns 0", async () => {
        await lockPool.lock(10000, 7);
        fastForwardAndMine(ethers.provider, 7 * 86400 - 1);
        expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(0);
      });
    });
    describe("just after unlock time", () => {
      it("returns amount of tokens", async () => {
        await lockPool.lock(10000, 7);
        await fastForwardAndMine(ethers.provider, 7 * 86400 + 1);
        expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(10000);
      });
    });
    describe("when two tokens are staked", () => {
      it("returns proper amounts", async () => {
        await lockPool.lock(10000, 7);
        // 0
        await fastForwardAndMine(ethers.provider, 1000);
        // 1000
        await lockPool.lock(20000, 30);
        // 1001
        await fastForwardAndMine(ethers.provider, 7 * 86400 - 1021);
        // 7 * 86400
        expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(0);

        await fastForwardAndMine(ethers.provider, 21);
        // 7 * 86400 + 1
        expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(10000);

        await fastForwardAndMine(ethers.provider, (30 - 7) * 86400 - 21 + 1000);
        // 30 * 86400 + 1000
        expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(10000);

        await fastForwardAndMine(ethers.provider, 22);
        // 30 * 86400 + 1002
        expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(30000);

        await fastForwardAndMine(ethers.provider, 10000000);
        // infty
        expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(30000);
      });
    });

    describe("when some utxos are used", () => {
      it("returns proper amounts", async () => {
        await lockPool.lock(10000, 7);
        await fastForwardAndMine(ethers.provider, 1000);
        // 1000
        await lockPool.lock(20000, 30);
        await fastForwardAndMine(ethers.provider, 3000);
        // 1000
        await lockPool.lock(50000, 30);
        await fastForwardAndMine(ethers.provider, 86400 * 30 - 4000 + 2000);
        expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(30000);
        await lockPool.unlock();
        expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(0);
        await fastForwardAndMine(ethers.provider, 2000);
        expect(await lockPool.stakeAvailableForUnlock(op.address)).to.eq(50000);
      });
    });
  });

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

    describe("when boardroom is not set", () => {
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
        await jedi.transferOwnership(lockPool.address);
        await droid.approve(lockPool.address, ethers.constants.MaxUint256);
        await lockPool.setRewardFactor(7, 100);
        await expect(lockPool.lock(100, 30)).to.be.revertedWith(
          "LockPool: boardroom is not intialized"
        );
      });
    });

    describe("when contract has not started", () => {
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
        await jedi.transferOwnership(lockPool.address);
        await droid.approve(lockPool.address, ethers.constants.MaxUint256);
        await lockPool.setRewardFactor(7, 100);
        await lockPool.setBoardroom(boardroomMock.address);
        await expect(lockPool.lock(100, 30)).to.be.revertedWith(
          "Timeboundable: Not started yet"
        );
      });
    });

    describe("when permissions are not set", () => {
      it("fails", async () => {
        droid = await SyntheticToken.deploy("DROID", "DROID", 18);
        jedi = await SyntheticToken.deploy("JEDI", "JEDI", 18);
        lockPool = await LockPool.deploy(
          droid.address,
          jedi.address,
          await now()
        );
        await expect(lockPool.lock(100, 30)).to.be.revertedWith(
          "LockPool: token permissions are not set"
        );
      });
    });

    describe("when contract is paused", () => {
      it("fails", async () => {
        await lockPool.setPauseLock(true);
        await expect(lockPool.lock(123, 7)).to.be.revertedWith(
          "LockPool: Locking is paused"
        );
      });
    });
  });

  describe("#unlock", () => {
    describe("when all prerequisites are met", () => {
      it("transfers all available tokens (1)", async () => {
        await droid.transfer(
          "0x0000000000000000000000000000000000000001",
          (await droid.balanceOf(op.address)).sub(30000)
        );

        await lockPool.lock(10000, 7);
        // 0
        await fastForwardAndMine(ethers.provider, 1000);
        // 1000
        await lockPool.lock(20000, 30);
        // 1001
        await fastForwardAndMine(ethers.provider, 7 * 86400 - 1012);
        // 7 * 86400
        await expect(lockPool.unlock()).to.be.revertedWith(
          "LockPool: No tokens available"
        );

        await fastForwardAndMine(ethers.provider, 11);
        // 7 * 86400 + 1
        await expect(lockPool.unlock()).to.not.be.reverted;
        expect(await droid.balanceOf(op.address)).to.eq(10000);
        expect(await lockPool.firstUtxo(op.address)).to.eq(1);

        await droid.transfer(
          "0x0000000000000000000000000000000000000001",
          await droid.balanceOf(op.address)
        );

        await fastForwardAndMine(ethers.provider, (30 - 7) * 86400 - 23 + 1000);
        // 30 * 86400 + 1000
        await expect(lockPool.unlock()).to.be.revertedWith(
          "LockPool: No tokens available"
        );

        expect(await droid.balanceOf(op.address)).to.eq(0);

        await fastForwardAndMine(ethers.provider, 30);
        // 30 * 86400 + 1002
        await expect(lockPool.unlock()).to.not.be.reverted;
        expect(await droid.balanceOf(op.address)).to.eq(20000);
        expect(await lockPool.firstUtxo(op.address)).to.eq(2);

        await fastForwardAndMine(ethers.provider, 1000000000);

        await expect(lockPool.unlock()).to.be.revertedWith(
          "LockPool: No tokens available"
        );
      });
    });

    it("transfers all available tokens (2)", async () => {
      await droid.transfer(
        "0x0000000000000000000000000000000000000001",
        (await droid.balanceOf(op.address)).sub(12000)
      );
      await lockPool.lock(1000, 7);
      await lockPool.lock(1000, 180);
      await lockPool.lock(1000, 180);
      await lockPool.lock(1000, 90);
      await lockPool.lock(1000, 90);
      await lockPool.lock(1000, 90);

      await fastForwardAndMine(ethers.provider, 1000);
      await lockPool.lock(1000, 7);
      await lockPool.lock(1000, 180);
      await lockPool.lock(1000, 180);
      await lockPool.lock(1000, 7);
      await lockPool.lock(1000, 90);
      await lockPool.lock(1000, 90);

      await fastForwardAndMine(ethers.provider, 90 * 86400 + 1);
      await expect(lockPool.unlock()).to.not.be.reverted;
      expect(await droid.balanceOf(op.address)).to.eq(8000);
      await expect(lockPool.unlock()).to.be.revertedWith(
        "LockPool: No tokens available"
      );
      await droid.transfer(
        "0x0000000000000000000000000000000000000001",
        await droid.balanceOf(op.address)
      );

      await fastForwardAndMine(ethers.provider, 90 * 86400 + 1);
      await expect(lockPool.unlock()).to.not.be.reverted;
      expect(await droid.balanceOf(op.address)).to.eq(4000);
      await expect(lockPool.unlock()).to.be.revertedWith(
        "LockPool: No tokens available"
      );
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
        await expect(lockPool.unlock()).to.be.revertedWith(
          "Timeboundable: Not started yet"
        );
      });
    });
  });

  describe("#setPauseLock", () => {
    describe("when called by the operator", () => {
      it("updates pauseLock", async () => {
        expect(await lockPool.pauseLock()).to.eq(false);
        await expect(lockPool.setPauseLock(true))
          .to.emit(lockPool, "Paused")
          .withArgs(op.address, true);
        expect(await lockPool.pauseLock()).to.eq(true);
      });
    });
    describe("when called by not Operator", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        await expect(
          lockPool.connect(other).setPauseLock(true)
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
  });

  describe("#setRewardDays", () => {
    describe("when called by Operator", () => {
      it("sets the reward days", async () => {
        lockPool = await LockPool.deploy(
          droid.address,
          jedi.address,
          await now()
        );
        await lockPool.setRewardFactor(7, 100);
        await lockPool.setRewardFactor(30, 150);
        await lockPool.setRewardFactor(7, 110);
        expect(await lockPool.rewardFactor(7)).to.eq(110);
        expect(await lockPool.rewardFactor(30)).to.eq(150);
        expect(await lockPool.getRewardDays()).to.eql([
          BigNumber.from(7),
          BigNumber.from(30),
        ]);
      });
    });
    describe("#balanceOf", () => {
      it("returns the balance of staked tokens", async () => {
        await lockPool.lock(10000, 7);
        await lockPool.lock(20000, 30);
        expect(await lockPool.balanceOf(op.address)).to.eq(30000);
      });
    });

    describe("#totalLocked", () => {
      it("returns the number of available for withdraw + locked funds", async () => {
        await lockPool.lock(20000, 30);
        await lockPool.lock(10000, 7);
        await lockPool.lock(10000, 30);
        await lockPool.lock(50000, 90);
        await fastForwardAndMine(ethers.provider, 8 * 86400);
        await lockPool.unlock();
        await fastForwardAndMine(ethers.provider, 30 * 86400);
        expect(await lockPool.totalLocked(op.address)).to.eq(80000);
      });
    });

    describe("#totalSupply", () => {
      it("returns the balance of all staked tokens", async () => {
        const [_, other] = await ethers.getSigners();
        await lockPool.lock(10000, 7);
        await lockPool.lock(20000, 30);
        await droid.transfer(other.address, 30000);
        await droid.connect(other).approve(lockPool.address, 30000);
        await lockPool.connect(other).lock(30000, 30);
        expect(await lockPool.totalSupply()).to.eq(60000);
      });
    });
  });

  describe("#migrateOwnership", () => {
    describe("when called by the Owner", () => {
      it("transfers reward token ownership and operator", async () => {
        const token = await lockPool.rewardsToken();
        const [_, other] = await ethers.getSigners();
        await expect(lockPool.migrateOwnership([token], other.address))
          .to.emit(lockPool, "MigratedOwnership")
          .withArgs(op.address, token, other.address);
        expect(await jedi.operator()).to.eq(other.address);
        expect(await jedi.owner()).to.eq(other.address);
      });
    });
    describe("when called by not Owner", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        const token = await lockPool.rewardsToken();
        await lockPool.transferOperator(other.address);
        await expect(
          lockPool.connect(other).migrateOwnership([token], op.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#migrateBalances", () => {
    describe("when called by the Owner", () => {
      it("transfers reward token balances", async () => {
        const amount = 12345;
        const token = await lockPool.rewardsToken();
        await jedi.transfer(lockPool.address, amount);
        const [_, other] = await ethers.getSigners();
        await expect(lockPool.migrateBalances([token], other.address))
          .to.emit(lockPool, "MigratedBalance")
          .withArgs(op.address, token, other.address, amount);
        expect(await jedi.balanceOf(lockPool.address)).to.eq(0);
        expect(await jedi.balanceOf(other.address)).to.eq(amount);
      });
    });
    describe("when called by not Owner", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        const token = await lockPool.rewardsToken();
        await lockPool.transferOperator(other.address);
        await expect(
          lockPool.connect(other).migrateBalances([token], op.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });
});
