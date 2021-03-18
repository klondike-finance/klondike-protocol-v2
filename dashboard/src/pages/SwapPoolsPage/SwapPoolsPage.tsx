import { Grid } from '@material-ui/core';
import LockPool from '../../components/LockPool';
import SwapPool from '../../components/SwapPool';

const SwapPoolsPage = () => {
  return (
    <Grid container spacing={3}>
      <SwapPool />
    </Grid>
  );
};

export default SwapPoolsPage;
