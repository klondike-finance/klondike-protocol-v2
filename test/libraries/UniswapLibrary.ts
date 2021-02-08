import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { UNISWAP_V2_FACTORY_ADDRESS } from "../../tasks/uniswap";
import { BTC, ETH } from "../helpers/helpers";
import { addUniswapPair, deployUniswap } from "../helpers/helpers";

describe("UniswapLibrary", () => {
  let UniswapLibrary: ContractFactory;
  let uniswapLibrary: Contract;
  let op: SignerWithAddress;
  const pair = ethers.utils.getAddress(
    "0x1f3d61248ec81542889535595903078109707941"
  );
  const wbtc = ethers.utils.getAddress(
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"
  );
  const kbtc = ethers.utils.getAddress(
    "0xe6c3502997f97f9bde34cb165fbce191065e068f"
  );

  before(async () => {
    const [operator] = await ethers.getSigners();
    op = operator;
    UniswapLibrary = await ethers.getContractFactory("UniswapLibraryTest");
    uniswapLibrary = await UniswapLibrary.deploy();
  });
  describe("#pairFor", () => {
    it("returns uniswap pair", async () => {
      expect(
        await uniswapLibrary.pairFor(UNISWAP_V2_FACTORY_ADDRESS, wbtc, kbtc)
      ).to.eq(pair);
      expect(
        await uniswapLibrary.pairFor(UNISWAP_V2_FACTORY_ADDRESS, kbtc, wbtc)
      ).to.eq(pair);
    });
  });
  describe("#sortTokens", () => {
    it("sorts token addresses in ascending oreder", async () => {
      const [token0, token1] = await uniswapLibrary.sortTokens(kbtc, wbtc);
      const [token2, token3] = await uniswapLibrary.sortTokens(wbtc, kbtc);
      expect(token0).to.eq(wbtc);
      expect(token2).to.eq(wbtc);
      expect(token1).to.eq(kbtc);
      expect(token3).to.eq(kbtc);
    });
    describe("when tokens are equal", () => {
      it("fails", async () => {
        await expect(uniswapLibrary.sortTokens(kbtc, kbtc)).to.be.revertedWith(
          "UniswapV2Library: IDENTICAL_ADDRESSES"
        );
      });
    });
    describe("when one of tokens is 0x0", () => {
      it("fails", async () => {
        await expect(
          uniswapLibrary.sortTokens(kbtc, ethers.constants.AddressZero)
        ).to.be.revertedWith("UniswapV2Library: ZERO_ADDRESS");
      });
    });
  });
  describe("#quote", () => {
    it("returns the uniswap price (no slippage)", async () => {
      expect(await uniswapLibrary.quote(20, 50, 25)).to.eq(10);
    });
    describe("when amount == 0", () => {
      it("fails", async () => {
        await expect(uniswapLibrary.quote(0, 50, 25)).to.be.revertedWith(
          "UniswapV2Library: INSUFFICIENT_AMOUNT"
        );
      });
    });
    describe("when one of reserves == 0", () => {
      it("fails", async () => {
        await expect(uniswapLibrary.quote(20, 0, 25)).to.be.revertedWith(
          "UniswapV2Library: INSUFFICIENT_LIQUIDITY"
        );
        await expect(uniswapLibrary.quote(20, 50, 0)).to.be.revertedWith(
          "UniswapV2Library: INSUFFICIENT_LIQUIDITY"
        );
      });
    });
  });
  describe("#getReserves", () => {
    it("returns reserves in the pair according to input order", async () => {
      const { factory, router } = await deployUniswap();
      const { underlying, synthetic, pair } = await addUniswapPair(
        factory,
        router,
        "WBTC",
        8,
        "KBTC",
        18
      );

      expect(
        await uniswapLibrary.getReserves(
          factory.address,
          underlying.address,
          synthetic.address
        )
      ).to.eql([BTC.mul(10), ETH.mul(10)]);
      expect(
        await uniswapLibrary.getReserves(
          factory.address,
          synthetic.address,
          underlying.address
        )
      ).to.eql([ETH.mul(10), BTC.mul(10)]);
    });
  });
});
