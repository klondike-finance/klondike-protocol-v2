import { Grid } from '@material-ui/core';
import UniswapBoardroom from '../../components/UniswapBoardroom';
import LiquidBoardroom from '../../components/LiquidBoardroom';
import VeBoardroom from '../../components/VeBoardroom';

const ManagersPage = () => {
  return (
    <Grid container spacing={3}>
      <UniswapBoardroom />
      <LiquidBoardroom />
      <VeBoardroom />
    </Grid>
  );
};

export default ManagersPage;
