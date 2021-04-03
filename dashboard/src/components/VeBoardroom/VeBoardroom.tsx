import { Card, CardContent, CardHeader, CircularProgress, Grid } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ethers } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import { toDate, toDecimal } from '../../lib/utils';
import Entry from '../Entry';

const VeBoardroom = () => {
  const { provider, deployments } = useContext(EthereumContext);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!provider || !deployments) return;
      const { address, abi } = deployments['VeBoardroomV1'];
      const pool = new ethers.Contract(address, abi, provider);
      try {
        const tokensLen = await pool.tokens_len();
        const promises = [];
        for (let i = 0; i < tokensLen; i++) {
          promises.push(pool.tokens(i));
        }
        const tokens = await Promise.all(promises);
        const timeCursor = await pool.time_cursor();
        const veToken = await pool.voting_escrow();
        const totalReceived = await pool.total_received();
        const admin = await pool.admin();
        const futureAdmin = await pool.future_admin();
        const canCheckpointToken = await pool.can_checkpoint_token();
        const emergencyReturn = await pool.emergency_return();
        const killed = await pool.is_killed();

        const values = {
          admin,
          futureAdmin,
          veToken,
          tokens,
          emergencyReturn,
          blank1: null,
          canCheckpointToken,
          totalReceived,
          timeCursor: toDate(timeCursor),
          killed,
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
          title="VeBoardroomV1"
          subheader={deployments && <Entry v={deployments['VeBoardroomV1'].address} />}
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

export default VeBoardroom;
