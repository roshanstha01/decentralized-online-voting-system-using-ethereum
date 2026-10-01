// Node modules
import React, { Component } from "react";
import { Link } from "react-router-dom";

// Components
import Navbar from "../Navbar/Navigation";
import NavbarAdmin from "../Navbar/NavigationAdmin";
import NotInit from "../NotInit";

// Contract
import getWeb3 from "../../getWeb3";
import Election from "../../contracts/Election.json";

// CSS
import "./Results.css";

export default class Result extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ElectionInstance: undefined,
      account: null,
      web3: null,
      isAdmin: false,
      candidateCount: 0,
      candidates: [],
      isElStarted: false,
      isElEnded: false,
    };
  }

  componentDidMount = async () => {
    if (!window.location.hash) {
      window.location = window.location + "#loaded";
      window.location.reload();
    }

    try {
      const web3 = await getWeb3();
      const accounts = await web3.eth.getAccounts();

      const networkId = await web3.eth.net.getId();
      const deployedNetwork = Election.networks[networkId];

      if (!deployedNetwork) {
        alert("Smart contract not deployed to this network.");
        return;
      }

      const instance = new web3.eth.Contract(
        Election.abi,
        deployedNetwork.address
      );

      this.setState({
        web3,
        ElectionInstance: instance,
        account: accounts[0],
      });

      // ✅ NEW ABI
      const candidateCount = await instance.methods.candidateCount().call();
      const start = await instance.methods.start().call();
      const end = await instance.methods.end().call();
      const admin = await instance.methods.admin().call();

      if (accounts[0].toLowerCase() === admin.toLowerCase()) {
        this.setState({ isAdmin: true });
      }

      const candidates = [];
      for (let i = 0; i < Number(candidateCount); i++) {
        const c = await instance.methods.candidateDetails(i).call();
        candidates.push({
          id: Number(c.candidateId),
          name: c.name,
          party: c.party,
          symbol: c.symbol, // "tree.png"
          age: Number(c.age),
          gender: c.gender,
          region: c.region,
          voteCount: Number(c.voteCount),
        });
      }

      this.setState({
        candidateCount: Number(candidateCount),
        candidates,
        isElStarted: start,
        isElEnded: end,
      });
    } catch (error) {
      alert("Failed to load web3, accounts, or contract.");
      console.error(error);
    }
  };

  render() {
    if (!this.state.web3) {
      return (
        <>
          {this.state.isAdmin ? <NavbarAdmin /> : <Navbar />}
          <center>Loading Web3, accounts, and contract...</center>
        </>
      );
    }

    return (
      <>
        {this.state.isAdmin ? <NavbarAdmin /> : <Navbar />}
        <br />

        {!this.state.isElStarted && !this.state.isElEnded ? (
          <NotInit />
        ) : this.state.isElStarted && !this.state.isElEnded ? (
          <div className="container-item attention">
            <center>
              <h3>The election is currently ongoing.</h3>
              <p>Results will be available after the election ends.</p>
              <Link
                to="/Voting"
                style={{ color: "black", textDecoration: "underline" }}
              >
                Go to Voting Page
              </Link>
            </center>
          </div>
        ) : !this.state.isElStarted && this.state.isElEnded ? (
          displayResults(this.state.candidates)
        ) : null}
      </>
    );
  }
}

/* -------------------- Winner Section -------------------- */

function displayWinner(candidates) {
  if (candidates.length === 0) return null;

  const maxVotes = Math.max(...candidates.map((c) => c.voteCount));
  const winners = candidates.filter((c) => c.voteCount === maxVotes);

  return (
    <>
      {winners.map((winner) => (
        <div className="container-winner" key={winner.id}>
          <div className="winner-info">
            <p className="winner-tag">Winner!</p>

            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <img
                src={`/symbols/${winner.symbol}`}
                alt="symbol"
                style={{
                  width: "80px",
                  height: "80px",
                  objectFit: "contain",
                }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />

              <div>
                <h2 style={{ margin: 0 }}>{winner.name}</h2>
                <p style={{ margin: "4px 0" }}>{winner.party}</p>
                <p style={{ margin: 0 }}>
                  {winner.gender}, {winner.age} | {winner.region}
                </p>
              </div>
            </div>
          </div>

          <div className="winner-votes">
            <div className="votes-tag">Total Votes:</div>
            <div className="vote-count">{winner.voteCount}</div>
          </div>
        </div>
      ))}
    </>
  );
}

/* -------------------- Results Table -------------------- */

export function displayResults(candidates) {
  // ✅ Sort descending order by votes
  const sortedCandidates = [...candidates].sort(
    (a, b) => b.voteCount - a.voteCount
  );

  const renderResults = (candidate) => (
    <tr key={candidate.id}>
      <td>{candidate.id}</td>
      <td>{candidate.name}</td>
      <td>{candidate.party}</td>

      {/* ✅ Symbol Image ONLY */}
      <td style={{ textAlign: "center" }}>
        <img
          src={`/symbols/${candidate.symbol}`}
          alt="symbol"
          style={{ width: "40px", height: "40px", objectFit: "contain" }}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </td>

      <td>{candidate.region}</td>
      <td>
        <strong>{candidate.voteCount}</strong>
      </td>
    </tr>
  );

  return (
    <>
      {sortedCandidates.length > 0 && (
        <div className="container-main">{displayWinner(sortedCandidates)}</div>
      )}

      <div className="container-main" style={{ borderTop: "1px solid" }}>
        <h2>Results</h2>
        <small>Total candidates: {sortedCandidates.length}</small>

        {sortedCandidates.length < 1 ? (
          <div className="container-item attention">
            <center>No candidates.</center>
          </div>
        ) : (
          <>
            <div className="container-item">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Party</th>
                    <th>Symbol</th>
                    <th>Region</th>
                    <th>Votes</th>
                  </tr>
                </thead>
                <tbody>{sortedCandidates.map(renderResults)}</tbody>
              </table>
            </div>

            <div
              className="container-item"
              style={{ border: "1px solid black" }}
            >
              <center>End of results</center>
            </div>
          </>
        )}
      </div>
    </>
  );
}