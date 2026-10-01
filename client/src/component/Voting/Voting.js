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
import "./Voting.css";

export default class Voting extends Component {
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

      currentVoter: {
        address: undefined,
        name: "",
        phone: "",
        hasVoted: false,
        isVerified: false,
        isRegistered: false,
      },

      loading: true,
      msg: "",
      lastRefreshAt: null,
    };
  }

  refreshTimer = null;
  accountTimer = null;

  // ✅ helper to support small ABI differences safely
  callFirst = async (instance, methodNames = [], args = []) => {
    for (const name of methodNames) {
      try {
        if (instance?.methods?.[name]) {
          return await instance.methods[name](...args).call();
        }
      } catch (e) {}
    }
    return null;
  };

  // ✅ load candidates (supports 0-based and 1-based mapping)
  loadCandidates = async (instance, count) => {
    const tryIndexMode = async (startIndex) => {
      const arr = [];
      for (let i = 0; i < count; i++) {
        const idx = startIndex + i;
        const c = await instance.methods.candidateDetails(idx).call();

        const id =
          c.candidateId !== undefined
            ? Number(c.candidateId)
            : c.id !== undefined
            ? Number(c.id)
            : idx;

        const name =
          c.name !== undefined
            ? c.name
            : c.header !== undefined
            ? c.header
            : "Candidate";

        const party =
          c.party !== undefined
            ? c.party
            : c.slogan !== undefined
            ? c.slogan
            : "";

        const symbol = c.symbol !== undefined ? c.symbol : "";

        const age =
          c.age !== undefined
            ? Number(c.age)
            : c.voterAge !== undefined
            ? Number(c.voterAge)
            : 0;

        const gender = c.gender !== undefined ? c.gender : "";
        const region = c.region !== undefined ? c.region : "";

        arr.push({ id, name, party, symbol, age, gender, region });
      }
      return arr;
    };

    // try 0-based first
    try {
      const arr0 = await tryIndexMode(0);
      const first = arr0[0];
      const looksInvalid =
        !first ||
        first.name === "Candidate" ||
        (first.name === "" && first.party === "" && first.id === 0);
      if (looksInvalid) throw new Error("0-based invalid");
      return arr0;
    } catch (e) {
      // fallback 1-based
      const arr1 = await tryIndexMode(1);
      return arr1;
    }
  };

  // ✅ fetch everything needed for voter screen
  refreshVoting = async ({ silent = true } = {}) => {
    try {
      const { web3, ElectionInstance } = this.state;
      if (!web3 || !ElectionInstance) return;

      if (!silent) this.setState({ loading: true });

      const accounts = await web3.eth.getAccounts();
      const account = accounts?.[0] || null;

      const candidateCountRaw = await this.callFirst(ElectionInstance, [
        "candidateCount",
        "getCandidateCount",
        "getTotalCandidate",
      ]);

      const start = await this.callFirst(ElectionInstance, ["start", "getStart"]);
      const end = await this.callFirst(ElectionInstance, ["end", "getEnd"]);

      const admin = await this.callFirst(ElectionInstance, ["admin", "getAdmin"]);
      const isAdmin =
        account && admin ? account.toLowerCase() === admin.toLowerCase() : false;

      const candidateCount = Number(candidateCountRaw || 0);

      // Always update election status + account
      this.setState({
        account,
        isAdmin,
        candidateCount,
        isElStarted: Boolean(start),
        isElEnded: Boolean(end),
        lastRefreshAt: new Date(),
      });

      // If admin, don't load voter/candidates
      if (isAdmin) {
        this.setState({ loading: false });
        return;
      }

      // Load candidates (only needed when election running or ended)
      // but cheap enough for demo; still safe
      const candidates =
        candidateCount > 0
          ? await this.loadCandidates(ElectionInstance, candidateCount)
          : [];

      // Load current voter (their status can change after verification)
      let voter = null;
      try {
        voter = await ElectionInstance.methods.voterDetails(account).call();
      } catch (e) {}

      const currentVoter = voter
        ? {
            address: voter.voterAddress || account,
            name: voter.name || "",
            phone: voter.phone || "",
            hasVoted: Boolean(
              voter.hasVoted !== undefined ? voter.hasVoted : voter.voted
            ),
            isVerified: Boolean(voter.isVerified),
            isRegistered: Boolean(voter.isRegistered),
          }
        : {
            address: account,
            name: "",
            phone: "",
            hasVoted: false,
            isVerified: false,
            isRegistered: false,
          };

      this.setState({
        candidates,
        currentVoter,
        loading: false,
      });
    } catch (e) {
      console.error(e);
      this.setState({
        loading: false,
        msg: "Auto-refresh failed (check console).",
      });
    }
  };

  componentDidMount = async () => {
    try {
      const web3 = await getWeb3();
      const accounts = await web3.eth.getAccounts();

      const networkId = await web3.eth.net.getId();
      const deployedNetwork = Election.networks[networkId];

      if (!deployedNetwork) {
        alert("Smart contract not deployed to the detected network.");
        return;
      }

      const instance = new web3.eth.Contract(
        Election.abi,
        deployedNetwork.address
      );

      this.setState(
        {
          web3,
          ElectionInstance: instance,
          account: accounts[0],
          loading: true,
          msg: "",
        },
        async () => {
          await this.refreshVoting({ silent: false });
        }
      );

      // ✅ Auto-refresh every 3 seconds (safe for demo)
      this.refreshTimer = setInterval(() => {
        this.refreshVoting({ silent: true });
      }, 3000);

      // ✅ Detect MetaMask account switching
      this.accountTimer = setInterval(async () => {
        try {
          const acc = await web3.eth.getAccounts();
          if (acc?.[0] && acc[0] !== this.state.account) {
            this.setState({ account: acc[0] }, () =>
              this.refreshVoting({ silent: true })
            );
          }
        } catch (e) {}
      }, 1500);
    } catch (error) {
      alert("Failed to load web3, accounts, or contract. Check console.");
      console.error(error);
      this.setState({ loading: false });
    }
  };

  componentWillUnmount() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.accountTimer) clearInterval(this.accountTimer);
  }

  castVote = async (id) => {
    try {
      if (this.state.isAdmin) {
        alert("Admin account cannot vote.");
        return;
      }

      this.setState({ msg: "Submitting vote to blockchain..." });

      await this.state.ElectionInstance.methods
        .vote(id)
        .send({ from: this.state.account, gas: 1000000 });

      this.setState({ msg: "✅ Vote cast successfully!" });

      // ✅ refresh state without full page reload
      await this.refreshVoting({ silent: true });
    } catch (err) {
      console.error(err);
      alert("Vote failed. Check console.");
      this.setState({ msg: "❌ Vote failed." });
    }
  };

  confirmVote = (id, name) => {
    if (this.state.isAdmin) {
      alert("Admin account cannot vote.");
      return;
    }

    const r = window.confirm(`Vote for ${name} (ID ${id})?\nAre you sure?`);
    if (r === true) {
      this.castVote(id);
    }
  };

  renderCandidates = (candidate) => {
    const disabled =
      !this.state.currentVoter.isRegistered ||
      !this.state.currentVoter.isVerified ||
      this.state.currentVoter.hasVoted ||
      !this.state.isElStarted ||
      this.state.isElEnded;

    return (
      <div className="container-item" key={candidate.id}>
        <div className="candidate-info">
          <h2>
            {candidate.name} <small>#{candidate.id}</small>
          </h2>

          <div className="candidate-meta">
            <div className="meta-row">
              <span className="meta-label">Party:</span>
              <span className="meta-value">{candidate.party}</span>
            </div>

            <div className="meta-row">
              <span className="meta-label">Region:</span>
              <span className="meta-value">{candidate.region}</span>
            </div>

            <div className="meta-row">
              <span className="meta-label">Gender/Age:</span>
              <span className="meta-value">
                {candidate.gender}, {candidate.age}
              </span>
            </div>

            <div className="meta-row">
              <span className="meta-label">Symbol:</span>
              <span className="meta-value">
                {candidate.symbol ? (
                  <img
                    src={`/symbols/${candidate.symbol}`}
                    alt="symbol"
                    style={{
                      width: "60px",
                      height: "60px",
                      objectFit: "contain",
                      marginLeft: "10px",
                      verticalAlign: "middle",
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span>N/A</span>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="vote-btn-container">
          <button
            onClick={() => this.confirmVote(candidate.id, candidate.name)}
            className="vote-bth"
            disabled={disabled}
            title={
              disabled
                ? "You must be registered + verified, election must be running, and you must not have voted."
                : "Cast your vote"
            }
          >
            Vote
          </button>
        </div>
      </div>
    );
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

    // ✅ Admin block UI (if admin visits /Voting manually)
    if (this.state.isAdmin) {
      return (
        <>
          <NavbarAdmin />
          <div className="container-main">
            <div className="container-item attention" style={{ display: "block" }}>
              <center>
                <h2>Admin account cannot vote</h2>
                <p>Voting is disabled for Admin in this system.</p>
                <br />
                <Link
                  to="/Report"
                  style={{ color: "black", textDecoration: "underline" }}
                >
                  Go to Report
                </Link>
                <br />
                <br />
                <Link
                  to="/Results"
                  style={{ color: "black", textDecoration: "underline" }}
                >
                  See Results
                </Link>
              </center>
            </div>
          </div>
        </>
      );
    }

    const { isElStarted, isElEnded, currentVoter, candidates, loading, msg, lastRefreshAt } =
      this.state;

    return (
      <>
        <Navbar />

        {/* small auto refresh info */}
        <div className="container-main">
          <small style={{ color: "grey" }}>
            Auto-refresh: every 3s
            {lastRefreshAt ? ` • Last: ${lastRefreshAt.toLocaleTimeString()}` : ""}
          </small>
          {msg ? (
            <div className="container-item info" style={{ marginTop: 10 }}>
              <center>{msg}</center>
            </div>
          ) : null}
        </div>

        <div>
          {loading ? (
            <div className="container-item info">
              <center>Loading election and voter status...</center>
            </div>
          ) : !isElStarted && !isElEnded ? (
            <NotInit />
          ) : isElStarted && !isElEnded ? (
            <>
              {/* Status box */}
              {currentVoter.isRegistered ? (
                currentVoter.isVerified ? (
                  currentVoter.hasVoted ? (
                    <div className="container-item success">
                      <div>
                        <strong>You have cast your vote.</strong>
                        <p />
                        <center>
                          <Link
                            to="/Results"
                            style={{
                              color: "black",
                              textDecoration: "underline",
                            }}
                          >
                            See Results
                          </Link>
                        </center>
                      </div>
                    </div>
                  ) : (
                    <div className="container-item info">
                      <center>Go ahead and cast your vote.</center>
                    </div>
                  )
                ) : (
                  <div className="container-item attention">
                    <center>Please wait for admin verification.</center>
                  </div>
                )
              ) : (
                <div className="container-item attention">
                  <center>
                    <p>You are not registered. Please register first.</p>
                    <br />
                    <Link
                      to="/Registration"
                      style={{
                        color: "black",
                        textDecoration: "underline",
                      }}
                    >
                      Registration Page
                    </Link>
                  </center>
                </div>
              )}

              {/* Candidate list */}
              <div className="container-main">
                <h2>Candidates</h2>
                <small>Total candidates: {candidates.length}</small>

                {candidates.length < 1 ? (
                  <div className="container-item attention">
                    <center>No candidates found.</center>
                  </div>
                ) : (
                  <>
                    {candidates.map(this.renderCandidates)}
                    <div
                      className="container-item"
                      style={{ border: "1px solid black" }}
                    >
                      <center>That is all.</center>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : !isElStarted && isElEnded ? (
            <div className="container-item attention">
              <center>
                <h3>The Election ended.</h3>
                <br />
                <Link
                  to="/Results"
                  style={{
                    color: "black",
                    textDecoration: "underline",
                  }}
                >
                  See results
                </Link>
              </center>
            </div>
          ) : null}
        </div>
      </>
    );
  }
}