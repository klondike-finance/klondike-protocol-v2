import { Card, CardContent, CardHeader, CircularProgress, Grid, Paper, Typography } from '@material-ui/core';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import UniswapPage from '../../pages/UniswapPage';
import unipairabi from '../../data/unipairabi.json';
import { ethers } from 'ethers';
import { Alert } from '@material-ui/lab';
import styled from 'styled-components';

type PropsType = { token0: string; token1: string; pair: string };

const UniswapPool = ({ token0, token1, pair }: PropsType) => {
  const name = `${token1} - ${token0} Uniswap Pool`;
  const { provider } = useContext(EthereumContext);
  const [reserve0, setReserve0] = useState(null);
  const [reserve1, setReserve1] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    (async () => {
      const p = new ethers.Contract(pair, unipairabi, provider);
      try {
        const [reserveA, reserveB] = await p.getReserves();
        const [res0, res1] = token0.toLowerCase() < token1.toLowerCase() ? [reserveA, reserveB] : [reserveB, reserveA];
        setReserve0(res0);
        setReserve1(res1);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [pair]);
  return (
    <Grid item xs={12} md={6} lg={6}>
      <Card>
        <CardHeader title={name}>{name}</CardHeader>
        <CardContent>
          {error && <Alert severity="error">{`Error fetching pair data: ${error}`}</Alert>}
          {(!reserve0 || !reserve1) && !error && <CircularProgress />}
          <p>{reserve0 && reserve1 && `Reserves: ${reserve0}${token0}, ${reserve1}${token1}`}</p>
          <p>
            {reserve0 &&
              reserve1 &&
              `Prices: ${(reserve1 as any) / (reserve0 as any)} ${token1}/${token0}, ${
                (reserve0 as any) / (reserve1 as any)
              } ${token0}/${token1}`}
          </p>
        </CardContent>
      </Card>
    </Grid>
  );
};

export default UniswapPool;
