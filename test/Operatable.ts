import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";

export function mixinOperatorTests(factory: () => Promise<Contract>) {
  let contract: Contract;
  beforeEach(async () => {
    contract = await factory();
  });
  describe("#transferOperator", () => {
    describe("when `Owner`", () => {
      it("transfers operator", async () => {
        const [owner, other] = await ethers.getSigners();
        expect(await contract.transferOperator(other.address))
          .to.emit(contract, "OperatorTransferred")
          .withArgs(owner.address, other.address);
        expect(await contract.operator()).to.eq(other.address);
      });
    });
    describe("when not `Owner`", () => {
      it("fails", async () => {
        const [owner, other, another] = await ethers.getSigners();
        await expect(
          contract.connect(other).transferOperator(another.address)
        ).to.be.revertedWith("caller is not the owner");
      });
    });
  });
}
