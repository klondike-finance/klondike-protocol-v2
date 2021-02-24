import { keccak256 } from 'ethers/lib/utils';
import deploymentsKovan from '../data/deployments.kovan.json';
import deploymentsMainnet from '../data/deployments.mainnet.json';
import registryMainnet from '../data/registry.mainnet.json';
import registryKovan from '../data/registry.kovan.json';
import { BigNumber } from 'ethers';

export const UNISWAP_V2_FACTORY_ADDRESS = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
export const UNISWAP_V2_ROUTER_ADDRESS = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

export function getDeployments(): { [key: string]: any } {
  return process.env.REACT_APP_NETWORK === 'mainnet' ? deploymentsMainnet : deploymentsKovan;
}

export function getRegistry(): { [key: string]: any } {
  return process.env.REACT_APP_NETWORK === 'mainnet' ? registryMainnet : registryKovan;
}

export function pairFor(factory: string, token0: string, token1: string) {
  const [tokenA, tokenB] = token0.toLowerCase() < token1.toLowerCase() ? [token0, token1] : [token1, token0];
  return (
    '0x' +
    keccak256(
      '0xff' +
        factory.slice(2) +
        keccak256('0x' + tokenA.slice(2) + tokenB.slice(2)).slice(2) +
        '96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f'
    ).slice(26)
  );
}

export function buildIndex(registry: { [key: string]: any }) {
  const idx: { [key: string]: any } = {};
  for (const key in registry) {
    idx[registry[key].address] = key;
  }
  idx[pairFor(UNISWAP_V2_FACTORY_ADDRESS, registry['KWBTC'].address, registry['WBTC'].address)] = 'KWBTC-WBTC-LP';
  idx[pairFor(UNISWAP_V2_FACTORY_ADDRESS, registry['Jedi'].address, registry['DAI'].address)] = 'Jedi-DAI-LP';
  idx[pairFor(UNISWAP_V2_FACTORY_ADDRESS, registry['Droid'].address, registry['DAI'].address)] = 'Droid-DAI-LP';
  idx[UNISWAP_V2_FACTORY_ADDRESS.toLowerCase()] = 'UniswapFactory';
  idx[UNISWAP_V2_ROUTER_ADDRESS.toLowerCase()] = 'UniswapRouter';
  return idx;
}

export function etherscanLink() {
  return process.env.REACT_APP_NETWORK === 'mainnet' ? 'https://etherscan.io' : 'https://kovan.etherscan.io';
}

export function toDate(ethTime: BigNumber) {
  if (ethTime.gt(11613807565)) return 'Never';
  return new Date(ethTime.toNumber() * 1000).toISOString();
}

export function toDecimal(num: BigNumber | string, decimals: number) {
  let str = num.toString();
  while (str.length < decimals + 1) {
    str = `0${str}`;
  }
  return `${str.slice(0, str.length - decimals)}.${str.slice(str.length - decimals)}`;
}
