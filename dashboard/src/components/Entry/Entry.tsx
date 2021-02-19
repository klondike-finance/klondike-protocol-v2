import { useContext } from 'react';
import { EthereumContext } from '../../App';
import { etherscanLink } from '../../lib/utils';
import styled from 'styled-components';

const Entry = ({ k, v }: { k: string; v: string }) => {
  const { addressIndex } = useContext(EthereumContext);
  if (!addressIndex) return null;
  const value = v.toString();
  if (value.startsWith('0x')) {
    const name = addressIndex[value] || 'Unknown';
    return (
      <Container>
        <p>
          {`${k}: ${name} `}
          <a href={`${etherscanLink()}/address/${value}`} target="_blank">{`${value}`}</a>
        </p>
      </Container>
    );
  }
  return <Container>{`${k}: ${value}`}</Container>;
};

const Container = styled.div`
  display: flex;
`;

export default Entry;
