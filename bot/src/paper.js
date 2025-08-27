
import { Connection } from '@solana/web3.js';
const RPC = process.env.SOLANA_RPC || 'http://127.0.0.1:8899';
const connection = new Connection(RPC, 'confirmed');
console.log('Paper bot connected to', RPC);
// TODO: integrate router quotes and build SerializedInstruction[] for executeRoute
