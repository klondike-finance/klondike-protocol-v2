import { Grid } from '@material-ui/core';
import LockPool from '../../components/LockPool';
import SwapPool from '../../components/SwapPool';

const SwapPoolsPage = () => {
  const pools = ['KWBTCWBTCLPJediPool', 'DroidDAILPJediPool', 'JediDAILPJediPool'];
  return (
    <Grid container spacing={3}>
      <SwapPool />
      <LockPool />
    </Grid>
  );
};

export default SwapPoolsPage;
