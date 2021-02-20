import { Card, CardContent, CardHeader, CircularProgress, Grid } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ethers } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import { toDate } from '../../lib/utils';
import Entry from '../Entry';

const EmissionManager = () => {
  const { provider, deployments } = useContext(EthereumContext);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!provider || !deployments) return;
      const { address, abi } = deployments['EmissionManagerV1'];
      const pool = new ethers.Contract(address, abi, provider);
      try {
        const owner = await pool.owner();
        const operator = await pool.operator();
        const tokenManager = await pool.tokenManager();
        const bondManager = await pool.bondManager();
        const boardroom = await pool.boardroom();
        const devFund = await pool.devFund();
        const stableFund = await pool.stableFund();

        const devFundRate = await pool.devFundRate();
        const stableFundRate = await pool.stableFundRate();
        const threshold = await pool.threshold();
        const maxRebase = await pool.maxRebase();

        const start = await pool.start();
        const finish = await pool.finish();

        const debouncePeriod = await pool.debouncePeriod();
        const lastCalled = await pool.lastCalled();

        const isInitialized = await pool.isInitialized();
        const pausePositiveRebase = await pool.pausePositiveRebase();

        const values = {
          owner,
          operator,
          tokenManager,
          bondManager,
          boardroom,
          devFund,
          stableFund,
          blank1: null,
          devFundRate,
          stableFundRate,
          threshold,
          maxRebase,
          blank2: null,
          start: toDate(start),
          finish: toDate(finish),
          blank3: null,
          debouncePeriod,
          lastCalled,
          blank4: null,
          isInitialized,
          pausePositiveRebase,
        };
        setData(values);
      } catch (e) {
        setError(e);
      }
    })();
  }, [provider, deployments]);

  return (
    <Grid item xs={12} md={6} lg={6}>
      <Card>
        <CardHeader
          title="EmissionManagerV1"
          subheader={deployments && <Entry v={deployments['EmissionManagerV1'].address} />}
        />
        <CardContent>
          {error && <Alert severity="error">{`Error fetching pair data: ${error}`}</Alert>}
          {!data && !error && <CircularProgress />}
          {data && !error && Object.keys(data).map((key) => <Entry key={key} k={key} v={data[key]} />)}
        </CardContent>
      </Card>
    </Grid>
  );
};

export default EmissionManager;
