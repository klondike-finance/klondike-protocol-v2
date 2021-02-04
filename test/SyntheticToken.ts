import { expect } from "chai";
import { Contract, ContractFactory, Wallet } from "ethers";
import { ethers } from "hardhat";
import { mixinOperatorTests } from "./Operatable";

describe("SyntheticToken", () => {
  let SyntheticToken: ContractFactory;
  before(async () => {
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
  });

  async function deployToken() {
    const name = "Synth";
    const symbol = "SYN";
    const decimals = 8;
    return await SyntheticToken.deploy(name, symbol, decimals);
  }

  describe("constructor", () => {
    it("sets parameters correctly", async () => {
      const name = "Synth";
      const symbol = "SYN";
      const decimals = 8;
      const token = await SyntheticToken.deploy(name, symbol, decimals);
      const [{ address: owner }] = await ethers.getSigners();
      expect(await token.name(), "Invalid name").to.eq(name);
      expect(await token.symbol(), "Invalid symbol").to.eq(symbol);
      expect(await token.decimals(), "Invalid decimals").to.eq(decimals);
      expect(await token.owner(), "Invalid owner").to.eq(owner);
      expect(await token.operator(), "Invalid operator").to.eq(owner);
    });
  });

  describe("#mint", async () => {
    let token: Contract;
    beforeEach(async () => {
      token = await deployToken();
    });
    describe("when not `Operator`", async () => {
      it("fails", async () => {
        const [
          _owner,
          notOwner,
          { address: randomAddress },
        ] = await ethers.getSigners();
        const amount = 12;
        await expect(
          token.connect(notOwner).mint(randomAddress, amount)
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
    describe("when `Operator`", async () => {
      it("mints token to a new address", async () => {
        const [owner, { address: randomAddress }] = await ethers.getSigners();
        const amount = 12;
        await expect(token.connect(owner).mint(randomAddress, amount))
          .to.emit(token, "Transfer")
          .withArgs(ethers.constants.AddressZero, randomAddress, amount);
      });
    });
  });

  describe("#burn", () => {
    let token: Contract;
    const mintAmount = 1000;
    beforeEach(async () => {
      const [owner, recepient] = await ethers.getSigners();
      token = await deployToken();
      await token.mint(owner.address, mintAmount);
      await token.mint(recepient.address, mintAmount);
    });
    describe("when not `Operator`", () => {
      it("fails", async () => {
        const [owner, recepient] = await ethers.getSigners();
        const amount = 12;
        await expect(token.connect(recepient).burn(amount)).to.be.revertedWith(
          "Only operator can call this method"
        );
      });
    });
    describe("when `Operator`", () => {
      describe("when insuffictient amount", () => {
        it("fails", async () => {
          const [owner] = await ethers.getSigners();
          await expect(
            token.connect(owner).burn(mintAmount * 2)
          ).to.be.revertedWith("ERC20: burn amount exceeds balance");
        });
      });
      describe("when suffictient amount", () => {
        it("burns token from `Operator`'s address", async () => {
          const [owner] = await ethers.getSigners();
          const amount = Math.floor(mintAmount / 2);
          await expect(token.connect(owner).burn(amount))
            .to.emit(token, "Transfer")
            .withArgs(owner.address, ethers.constants.AddressZero, amount);
        });
      });
    });
  });
  describe("#burnFrom", () => {
    let token: Contract;
    const mintAmount = 1000;
    beforeEach(async () => {
      const [owner, recepient] = await ethers.getSigners();
      token = await deployToken();
      await token.mint(owner.address, mintAmount);
      await token.mint(recepient.address, mintAmount);
    });
    describe("when not `Operator`", () => {
      it("fails", async () => {
        const [owner, recepient] = await ethers.getSigners();
        const amount = 12;
        await expect(
          token.connect(recepient).burnFrom(owner.address, amount)
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
    describe("when `Operator`", () => {
      describe("when no (or partial) allowance from address owner to Operator", () => {
        it("fails", async () => {
          const [owner, recepient] = await ethers.getSigners();
          await expect(
            token.connect(owner).burnFrom(recepient.address, mintAmount * 2)
          ).to.be.revertedWith("ERC20: burn amount exceeds allowance");
        });
      });
      describe("when full allowance from address owner to Operator", async () => {
        it("burns the specified amount", async () => {
          const [owner, recepient] = await ethers.getSigners();
          const amount = 12;
          await token
            .connect(recepient)
            .increaseAllowance(owner.address, amount);
          await expect(token.connect(owner).burnFrom(recepient.address, amount))
            .to.emit(token, "Transfer")
            .withArgs(recepient.address, ethers.constants.AddressZero, amount);
        });
      });
    });
  });

  mixinOperatorTests(deployToken);
});
