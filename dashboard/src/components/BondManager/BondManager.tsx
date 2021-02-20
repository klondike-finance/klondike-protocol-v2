import { Card, CardContent, CardHeader, CircularProgress, Grid } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ethers } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import { toDate } from '../../lib/utils';
import Entry from '../Entry';

const BondManager = () => {
  const { provider, deployments } = useContext(EthereumContext);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!provider || !deployments) return;
      const { address, abi } = deployments['BondManagerV1'];
      const pool = new ethers.Contract(address, abi, provider);
      try {
        const owner = await pool.owner();
        const operator = await pool.operator();
        const tokenManager = await pool.tokenManager();
        const start = await pool.start();
        const finish = await pool.finish();
        const validTokenPermissions = await pool.validTokenPermissions();
        const pauseBuyBonds = await pool.pauseBuyBonds();

        const values = {
          owner,
          operator,
          tokenManager,
          blank1: null,
          start: toDate(start),
          finish: toDate(finish),
          blank2: null,
          validTokenPermissions,
          pauseBuyBonds,
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
          title="BondManagerV1"
          subheader={deployments && <Entry v={deployments['BondManagerV1'].address} />}
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

export default BondManager;
