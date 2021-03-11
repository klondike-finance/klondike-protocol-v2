import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { ETH, fastForwardAndMine, now } from "./helpers/helpers";

describe("LiquidBoardroom", () => {
  let Boardroom: ContractFactory;
  let VeToken: ContractFactory;
  let SyntheticToken: ContractFactory;
  let TokenManagerMock: ContractFactory;
  let boardroom: Contract;
  let klon: Contract;
  let tokenManagerMock: Contract;
  let kbtc: Contract;
  let veToken: Contract;
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
    Boardroom = await ethers.getContractFactory("LiquidBoardroom");
    VeToken = await ethers.getContractFactory("VeToken");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
    TokenManagerMock = await ethers.getContractFactory("TokenManagerMock");
  });
  beforeEach(async () => {
    klon = await SyntheticToken.deploy("KLON", "KLON", 18);
    await klon.mint(op.address, ETH.mul(100));
    kbtc = await SyntheticToken.deploy("KBTC", "KBTC", 18);
    await kbtc.mint(op.address, ETH.mul(100));
    tokenManagerMock = await TokenManagerMock.deploy();
    await tokenManagerMock.addToken(kbtc.address);
    boardroom = await createBoardroom();
    await klon.approve(boardroom.address, ethers.constants.MaxUint256);
    veToken = await VeToken.deploy(klon.address, "VEKLON", "VEKLON", "1");
    await boardroom.setVeToken(veToken.address);
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
    it("creates LiquidBoardroom", async () => {
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

  describe("#claimRewards", () => {
    it("takes into account veKlon holdings", async () => {
      const tick = 86400;
      const stakers = [staker0, staker1, staker2, staker3];
      for (const staker of stakers) {
        await klon.transfer(staker.address, 1000);
        await klon
          .connect(staker)
          .approve(boardroom.address, ethers.constants.MaxUint256);
        await klon
          .connect(staker)
          .approve(veToken.address, ethers.constants.MaxUint256);
      }
      // day 1
      await boardroom.connect(staker0).stake(staker0.address, 60);
      await veToken
        .connect(staker0)
        .create_lock(40, (await now()) + 86400 * 7 * 4);
      await boardroom.connect(staker1).stake(staker1.address, 200);
      await veToken
        .connect(staker1)
        .create_lock(100, (await now()) + 86400 * 7 * 52);

      await fastForwardAndMine(ethers.provider, tick);
      // day 2
      await kbtc.transfer(boardroom.address, 20000);
      await boardroom
        .connect(emissionManagerMock)
        .notifyTransfer(kbtc.address, 20000);
      await boardroom.connect(staker0).updateAccruals();
      await boardroom.connect(staker1).updateAccruals();
      expect(await kbtc.balanceOf(boardroom.address)).to.eq(20000);
      expect(await kbtc.balanceOf(staker0.address)).to.eq(0);
      expect(await kbtc.balanceOf(staker1.address)).to.eq(0);

      await expect(boardroom.connect(staker0).claimRewards())
        .to.emit(boardroom, "RewardPaid")
        .withArgs(kbtc.address, staker0.address, 5000);
      await expect(boardroom.connect(staker1).claimRewards())
        .to.emit(boardroom, "RewardPaid")
        .withArgs(kbtc.address, staker1.address, 15000);

      expect(
        (await boardroom.personRewardAccruals(kbtc.address, staker0.address))[1]
      ).to.eq(BigNumber.from(0));
      expect(
        (await boardroom.personRewardAccruals(kbtc.address, staker1.address))[1]
      ).to.eq(BigNumber.from(0));

      expect(await kbtc.balanceOf(staker0.address)).to.eq(5000);
      expect(await kbtc.balanceOf(staker1.address)).to.eq(15000);

      expect(await kbtc.balanceOf(boardroom.address)).to.eq(0);

      await boardroom.connect(staker0).claimRewards();
      await boardroom.connect(staker1).claimRewards();

      expect(await kbtc.balanceOf(staker0.address)).to.eq(5000);
      expect(await kbtc.balanceOf(staker1.address)).to.eq(15000);
    });
  });
});
