import { keccak256 } from 'ethers/lib/utils';
import deploymentsKovan from '../data/deployments.kovan.json';
import deploymentsMainnet from '../data/deployments.mainnet.json';

export const UNISWAP_V2_FACTORY_ADDRESS = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
export const UNISWAP_V2_ROUTER_ADDRESS = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

export function getDeployments(): { [key: string]: any } {
  return process.env.REACT_APP_NETWORK === 'mainnet' ? deploymentsMainnet : deploymentsKovan;
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
