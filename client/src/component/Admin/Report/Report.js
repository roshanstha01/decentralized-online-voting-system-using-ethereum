import React, { Component } from "react";
import NavbarAdmin from "../../Navbar/NavigationAdmin";
import AdminOnly from "../../AdminOnly";

import getWeb3 from "../../../getWeb3";
import Election from "../../../contracts/Election.json";

// Charts (Chart.js v2 + react-chartjs-2 v2)
import { Bar, Doughnut, Line } from "react-chartjs-2";

export default class Report extends Component {
  state = {
    ElectionInstance: null,
    account: null,
    web3: null,
    loading: true,
    error: "",

    isAdmin: false,

    candidateCount: 0,
    voterCount: 0,
    totalVotes: 0,
    candidates: [],
    winner: null,

    isElStarted: false,
    isElEnded: false,

    demographicsAvailable: true,
    votedByAge: {},
    votedByRegion: {},

    timelineAvailable: true,
    votesTimelineLabels: [],
    votesTimelineData: [],

    // ✅ auto refresh
    lastRefreshAt: null,
  };

  refreshTimer = null;
  accountTimer = null;

  downloadPDF = () => {
    window.print();
  };

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

  loadCandidates = async (instance, count) => {
    const tryIndexMode = async (startIndex) => {
      const arr = [];
      let totalVotes = 0;

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

        const slogan =
          c.slogan !== undefined
            ? c.slogan
            : c.party !== undefined
            ? c.party
            : "";

        const votes =
          c.voteCount !== undefined
            ? Number(c.voteCount)
            : c.votes !== undefined
            ? Number(c.votes)
            : 0;

        const symbol = c.symbol !== undefined ? c.symbol : "";

        totalVotes += votes;
        arr.push({ id, name, slogan, symbol, voteCount: votes });
      }

      return { arr, totalVotes };
    };

    try {
      const { arr, totalVotes } = await tryIndexMode(0);
      const first = arr[0];
      const looksInvalid =
        !first ||
        first.name === "Candidate" ||
        (first.name === "" && first.slogan === "" && first.voteCount === 0);
      if (looksInvalid) throw new Error("0-based invalid");
      return { candidates: arr, totalVotes };
    } catch (e) {
      const { arr, totalVotes } = await tryIndexMode(1);
      return { candidates: arr, totalVotes };
    }
  };

  buildColors = (n) => {
    const base = [
      "#3B82F6",
      "#22C55E",
      "#F59E0B",
      "#EF4444",
      "#8B5CF6",
      "#06B6D4",
      "#EC4899",
      "#84CC16",
      "#F97316",
      "#14B8A6",
      "#6366F1",
      "#A855F7",
    ];
    const bg = [];
    for (let i = 0; i < n; i++) bg.push(base[i % base.length]);
    return bg;
  };

  loadVoterDemographics = async (instance, voterCount) => {
    try {
      const addressGetterCandidates = [
        "voterAddresses",
        "voters",
        "voterList",
        "voterAddressList",
        "getVoterAddress",
        "getVoter",
      ];

      const getAddressAt = async (i) => {
        for (const fn of addressGetterCandidates) {
          if (!instance?.methods?.[fn]) continue;
          try {
            const res = await instance.methods[fn](i).call();
            if (typeof res === "string") return res;
            if (res?.voterAddress) return res.voterAddress;
            if (res?.addr) return res.addr;
          } catch (e) {}
        }
        return null;
      };

      if (!instance?.methods?.voterDetails) {
        this.setState({ demographicsAvailable: false });
        return;
      }

      const votedByAge = {};
      const votedByRegion = {};

      const toAgeBucket = (ageNum) => {
        const a = Number(ageNum);
        if (Number.isNaN(a)) return "Unknown";
        if (a < 18) return "<18";
        if (a <= 25) return "18-25";
        if (a <= 35) return "26-35";
        if (a <= 45) return "36-45";
        if (a <= 60) return "46-60";
        return "60+";
      };

      for (let i = 0; i < voterCount; i++) {
        const addr = await getAddressAt(i);
        if (!addr) {
          this.setState({ demographicsAvailable: false });
          return;
        }

        const v = await instance.methods.voterDetails(addr).call();
        const hasVoted =
          v.hasVoted !== undefined
            ? v.hasVoted
            : v.voted !== undefined
            ? v.voted
            : false;

        if (!hasVoted) continue;

        const age =
          v.age !== undefined
            ? v.age
            : v.voterAge !== undefined
            ? v.voterAge
            : null;

        const region =
          v.region !== undefined
            ? v.region
            : v.voterRegion !== undefined
            ? v.voterRegion
            : "Unknown";

        const ageBucket = toAgeBucket(age);
        votedByAge[ageBucket] = (votedByAge[ageBucket] || 0) + 1;

        const reg = region && region !== "" ? region : "Unknown";
        votedByRegion[reg] = (votedByRegion[reg] || 0) + 1;
      }

      this.setState({ votedByAge, votedByRegion, demographicsAvailable: true });
    } catch (e) {
      console.error(e);
      this.setState({ demographicsAvailable: false });
    }
  };

  // ✅ Hour-based timeline from first hour to last hour
  loadVotesTimeline = async (web3, instance) => {
    try {
      const eventNames = ["votedEvent", "Voted", "VoteCast", "Vote", "VotedEvent"];

      let events = null;

      for (const ev of eventNames) {
        try {
          events = await instance.getPastEvents(ev, {
            fromBlock: 0,
            toBlock: "latest",
          });
          if (events) break;
        } catch (e) {}
      }

      if (!events || events.length === 0) {
        this.setState({ timelineAvailable: false });
        return;
      }

      const voteHours = [];
      for (const ev of events) {
        if (!ev.blockNumber) continue;
        const block = await web3.eth.getBlock(ev.blockNumber);
        if (!block?.timestamp) continue;

        const d = new Date(Number(block.timestamp) * 1000);

        const hourKey =
          d.getFullYear() +
          "-" +
          String(d.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(d.getDate()).padStart(2, "0") +
          " " +
          String(d.getHours()).padStart(2, "0") +
          ":00";

        voteHours.push(hourKey);
      }

      if (voteHours.length === 0) {
        this.setState({ timelineAvailable: false });
        return;
      }

      const counts = {};
      voteHours.forEach((h) => {
        counts[h] = (counts[h] || 0) + 1;
      });

      const sorted = Object.keys(counts).sort();

      const start = new Date(sorted[0].replace(" ", "T") + ":00");
      const end = new Date(sorted[sorted.length - 1].replace(" ", "T") + ":00");

      const labels = [];
      const data = [];

      const current = new Date(start);
      while (current <= end) {
        const key =
          current.getFullYear() +
          "-" +
          String(current.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(current.getDate()).padStart(2, "0") +
          " " +
          String(current.getHours()).padStart(2, "0") +
          ":00";

        labels.push(key);
        data.push(counts[key] || 0);

        current.setHours(current.getHours() + 1);
      }

      this.setState({
        votesTimelineLabels: labels,
        votesTimelineData: data,
        timelineAvailable: labels.length > 0,
      });
    } catch (e) {
      console.error(e);
      this.setState({ timelineAvailable: false });
    }
  };

  // ✅ NEW: refresh function for auto-sync
  refreshReport = async ({ silent = true } = {}) => {
    try {
      const { web3, ElectionInstance } = this.state;
      if (!web3 || !ElectionInstance) return;

      if (!silent) this.setState({ loading: true, error: "" });

      const accounts = await web3.eth.getAccounts();
      const admin = await this.callFirst(ElectionInstance, ["admin", "getAdmin"]);
      const isAdmin =
        accounts[0] && admin && accounts[0].toLowerCase() === admin.toLowerCase();

      const start = await this.callFirst(ElectionInstance, ["start", "getStart"]);
      const end = await this.callFirst(ElectionInstance, ["end", "getEnd"]);

      const candidateCountRaw = await this.callFirst(ElectionInstance, [
        "candidateCount",
        "getTotalCandidate",
        "getCandidateCount",
      ]);

      const voterCountRaw = await this.callFirst(ElectionInstance, [
        "voterCount",
        "getTotalVoter",
        "getVoterCount",
      ]);

      const candidateCount = Number(candidateCountRaw || 0);
      const voterCount = Number(voterCountRaw || 0);

      const { candidates, totalVotes } = await this.loadCandidates(
        ElectionInstance,
        candidateCount
      );

      let winner = null;
      if (candidates.length > 0) {
        winner = candidates.reduce((prev, cur) =>
          cur.voteCount > prev.voteCount ? cur : prev
        );
      }

      this.setState(
        {
          account: accounts[0],
          isAdmin,
          candidateCount,
          voterCount,
          candidates,
          totalVotes,
          winner,
          isElStarted: Boolean(start),
          isElEnded: Boolean(end),
          loading: false,
          error: "",
          lastRefreshAt: new Date(),
        },
        async () => {
          // These depend on vote events / voter hasVoted
          await this.loadVoterDemographics(ElectionInstance, voterCount);
          await this.loadVotesTimeline(web3, ElectionInstance);
        }
      );
    } catch (e) {
      console.error(e);
      // Keep old UI visible; show small error only
      this.setState({ error: "Auto-refresh failed (check console)." });
    }
  };

  componentDidMount = async () => {
    try {
      const web3 = await getWeb3();
      const accounts = await web3.eth.getAccounts();
      const networkId = await web3.eth.net.getId();
      const deployedNetwork = Election.networks[networkId];

      if (!deployedNetwork) {
        this.setState({
          loading: false,
          error: "Smart contract not deployed to the detected network.",
        });
        return;
      }

      const instance = new web3.eth.Contract(Election.abi, deployedNetwork.address);

      const admin = await this.callFirst(instance, ["admin", "getAdmin"]);
      const isAdmin =
        accounts[0] && admin && accounts[0].toLowerCase() === admin.toLowerCase();

      const start = await this.callFirst(instance, ["start", "getStart"]);
      const end = await this.callFirst(instance, ["end", "getEnd"]);

      const candidateCountRaw = await this.callFirst(instance, [
        "candidateCount",
        "getTotalCandidate",
        "getCandidateCount",
      ]);

      const voterCountRaw = await this.callFirst(instance, [
        "voterCount",
        "getTotalVoter",
        "getVoterCount",
      ]);

      const candidateCount = Number(candidateCountRaw || 0);
      const voterCount = Number(voterCountRaw || 0);

      const { candidates, totalVotes } = await this.loadCandidates(
        instance,
        candidateCount
      );

      let winner = null;
      if (candidates.length > 0) {
        winner = candidates.reduce((prev, cur) =>
          cur.voteCount > prev.voteCount ? cur : prev
        );
      }

      this.setState(
        {
          web3,
          account: accounts[0],
          ElectionInstance: instance,
          isAdmin,
          candidateCount,
          voterCount,
          candidates,
          totalVotes,
          winner,
          isElStarted: Boolean(start),
          isElEnded: Boolean(end),
          loading: false,
          error: "",
          lastRefreshAt: new Date(),
        },
        async () => {
          await this.loadVoterDemographics(instance, voterCount);
          await this.loadVotesTimeline(web3, instance);
        }
      );

      // ✅ AUTO-REFRESH every 3 seconds (safe for demo)
      this.refreshTimer = setInterval(() => {
        this.refreshReport({ silent: true });
      }, 3000);

      // ✅ Detect account change (MetaMask switching) — refresh
      this.accountTimer = setInterval(async () => {
        try {
          const acc = await web3.eth.getAccounts();
          if (acc?.[0] && acc[0] !== this.state.account) {
            this.setState({ account: acc[0] }, () => this.refreshReport({ silent: true }));
          }
        } catch (e) {}
      }, 1500);
    } catch (err) {
      console.error(err);
      this.setState({
        loading: false,
        error: "Failed to load report from blockchain. Check console.",
      });
    }
  };

  componentWillUnmount() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.accountTimer) clearInterval(this.accountTimer);
  }

  render() {
    const {
      loading,
      error,
      candidates,
      totalVotes,
      voterCount,
      winner,
      isElStarted,
      isElEnded,
      demographicsAvailable,
      votedByAge,
      votedByRegion,
      timelineAvailable,
      votesTimelineLabels,
      votesTimelineData,
      lastRefreshAt,
    } = this.state;

    const turnout =
      voterCount === 0 ? "0.00" : ((totalVotes / voterCount) * 100).toFixed(2);

    const status =
      !isElStarted && !isElEnded
        ? "Not Started"
        : isElStarted && !isElEnded
        ? "Running"
        : !isElStarted && isElEnded
        ? "Ended"
        : "Unknown";

    const leaderboard = [...candidates].sort((a, b) => b.voteCount - a.voteCount);

    const candColors = this.buildColors(candidates.length);
    const ageColors = this.buildColors(Object.keys(votedByAge).length || 1);
    const regColors = this.buildColors(Object.keys(votedByRegion).length || 1);

    const barData = {
      labels: candidates.map((c) => c.name),
      datasets: [
        {
          label: "Votes",
          data: candidates.map((c) => c.voteCount),
          backgroundColor: candColors,
          borderColor: "#111827",
          borderWidth: 1,
        },
      ],
    };

    const donutData = {
      labels: candidates.map((c) => c.name),
      datasets: [
        {
          data: candidates.map((c) => c.voteCount),
          backgroundColor: candColors,
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    };

    const turnoutGaugeData = {
      labels: ["Turnout", "Remaining"],
      datasets: [
        {
          data: [Number(turnout), 100 - Number(turnout)],
          backgroundColor: ["#22C55E", "#E5E7EB"],
          borderColor: ["#16A34A", "#D1D5DB"],
          borderWidth: 1,
        },
      ],
    };

    const votedAgeData = {
      labels: Object.keys(votedByAge),
      datasets: [
        {
          data: Object.values(votedByAge),
          backgroundColor: ageColors,
          borderColor: "#fff",
          borderWidth: 2,
        },
      ],
    };

    const votedRegionData = {
      labels: Object.keys(votedByRegion),
      datasets: [
        {
          data: Object.values(votedByRegion),
          backgroundColor: regColors,
          borderColor: "#fff",
          borderWidth: 2,
        },
      ],
    };

    const timelineData = {
      labels: votesTimelineLabels,
      datasets: [
        {
          label: "Votes (events)",
          data: votesTimelineData,
          borderColor: "#3B82F6",
          backgroundColor: "rgba(59,130,246,0.15)",
          pointBackgroundColor: "#F59E0B",
          pointBorderColor: "#111827",
          borderWidth: 3,
          fill: true,
        },
      ],
    };

    return (
      <>
        <style>
          {`
            .rep-section { margin-top: 18px; }
            .rep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
            .rep-card {
              border: 1px solid #ddd;
              border-radius: 12px;
              padding: 14px;
              background: #fff;
            }
            .rep-card h4 { margin: 0 0 10px 0; }
            .rep-subtitle { color: grey; margin-top: 4px; }

            .rep-winner-wrap { margin-top: 10px; }
            .rep-winner-banner {
              width: 100%;
              border: 1px solid #2d7a2d;
              background: #dfffe0;
              border-radius: 10px;
              padding: 14px 16px;
              display: flex;
              align-items: center;
              justify-content: center;
              text-align: center;
              font-size: 20px;
              font-weight: 700;
              line-height: 1.3;
              box-sizing: border-box;
              min-height: 56px;
            }

            @media (max-width: 900px) {
              .rep-grid { grid-template-columns: 1fr; }
              .rep-winner-banner { font-size: 18px; padding: 12px 14px; }
            }

            @media print {
              body * { visibility: hidden; }
              #report-pdf, #report-pdf * { visibility: visible; }
              #report-pdf { position: absolute; left: 0; top: 0; width: 100%; }
              .no-print { display: none !important; }

              .rep-card { page-break-inside: avoid; break-inside: avoid; }
              table { page-break-inside: auto; break-inside: auto; }
              tr { page-break-inside: avoid; break-inside: avoid; }
              .page-break { page-break-before: always; break-before: page; }
            }
          `}
        </style>

        <NavbarAdmin />
        <AdminOnly />

        <div className="container-main">
          <div className="container-item" style={{ display: "block" }}>
            <div
              className="no-print"
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div>
                <h2>Election Report</h2>
                <p style={{ margin: 0, color: "grey", fontSize: 13 }}>
                  Auto-refresh: every 3s
                  {lastRefreshAt
                    ? ` • Last refresh: ${lastRefreshAt.toLocaleTimeString()}`
                    : ""}
                </p>
              </div>
              <div style={{ alignSelf: "center" }}>
                <button className="vote-bth" onClick={this.downloadPDF}>
                  Download PDF
                </button>
              </div>
            </div>

            {loading ? (
              <p>Loading report...</p>
            ) : error ? (
              <div className="container-item attention" style={{ marginTop: 10 }}>
                <center>
                  <strong>{error}</strong>
                </center>
              </div>
            ) : (
              <div id="report-pdf">
                <p className="rep-subtitle">Fetched from Ethereum blockchain.</p>

                <div className="rep-section rep-card">
                  <h3 style={{ marginTop: 0 }}>Overview</h3>
                  <p>
                    <b>Status:</b> {status}
                  </p>
                  <p>
                    <b>Total Candidates:</b> {this.state.candidateCount}
                  </p>
                  <p>
                    <b>Total Registered Voters:</b> {this.state.voterCount}
                  </p>
                  <p>
                    <b>Total Votes Cast:</b> {this.state.totalVotes}
                  </p>
                  <p>
                    <b>Turnout:</b> {turnout}%
                  </p>
                </div>

                <div className="rep-section rep-card">
                  <h3 style={{ marginTop: 0 }}>Winner / Leading</h3>
                  <div className="rep-winner-wrap">
                    <div className="rep-winner-banner">
                      {winner
                        ? `${winner.name} (ID ${winner.id}) - ${winner.voteCount} votes`
                        : "No votes yet"}
                    </div>
                  </div>
                </div>

                <div className="rep-section">
                  <h3>Results Visualization</h3>
                  <div className="rep-grid">
                    <div className="rep-card">
                      <h4>Bar Chart (Votes)</h4>
                      <Bar
                        data={barData}
                        options={{
                          legend: { display: false },
                          scales: {
                            xAxes: [{ ticks: { fontStyle: "bold" } }],
                            yAxes: [{ ticks: { beginAtZero: true } }],
                          },
                        }}
                      />
                    </div>

                    <div className="rep-card">
                      <h4>Donut Chart (Vote Share)</h4>
                      <Doughnut
                        data={donutData}
                        options={{
                          legend: { position: "bottom" },
                          cutoutPercentage: 60,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="page-break" />

                <div className="rep-section rep-card">
                  <h3 style={{ marginTop: 0 }}>Leaderboard</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                          Rank
                        </th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                          Candidate
                        </th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                          Symbol
                        </th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                          Votes
                        </th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                          %
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((c, idx) => {
                        const pct =
                          totalVotes === 0
                            ? "0.00"
                            : ((c.voteCount / totalVotes) * 100).toFixed(2);
                        const isWinner = winner && winner.id === c.id;

                        return (
                          <tr
                            key={idx}
                            style={
                              isWinner
                                ? { fontWeight: "700", backgroundColor: "#fff7cc" }
                                : {}
                            }
                          >
                            <td style={{ padding: "10px 0" }}>#{idx + 1}</td>
                            <td>
                              {c.name}{" "}
                              {isWinner && (
                                <span
                                  style={{
                                    marginLeft: 10,
                                    padding: "3px 8px",
                                    borderRadius: 10,
                                    backgroundColor: "#ccab00",
                                    color: "black",
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  WINNER
                                </span>
                              )}
                            </td>
                            <td>
                              {c.symbol ? (
                                <img
                                  src={`/symbols/${c.symbol}`}
                                  alt="symbol"
                                  style={{
                                    width: 42,
                                    height: 42,
                                    objectFit: "contain",
                                    border: isWinner
                                      ? "2px solid #ccab00"
                                      : "1px solid #ccc",
                                    borderRadius: 6,
                                    padding: 3,
                                    background: "white",
                                  }}
                                  onError={(e) =>
                                    (e.currentTarget.style.display = "none")
                                  }
                                />
                              ) : (
                                "N/A"
                              )}
                            </td>
                            <td>{c.voteCount}</td>
                            <td>{pct}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="rep-section">
                  <h3>Turnout & Activity</h3>
                  <div className="rep-grid">
                    <div className="rep-card">
                      <h4>Turnout Gauge</h4>
                      <Doughnut
                        data={turnoutGaugeData}
                        options={{
                          rotation: Math.PI,
                          circumference: Math.PI,
                          cutoutPercentage: 70,
                          legend: { position: "bottom" },
                        }}
                      />
                      <center style={{ marginTop: 10, fontWeight: 700, fontSize: 16 }}>
                        {turnout}% turnout
                      </center>
                    </div>

                    <div className="rep-card">
                      <h4>Notes</h4>
                      <p style={{ color: "grey" }}>
                        Turnout = (Votes Cast / Registered Voters) × 100
                      </p>
                      <p style={{ color: "grey" }}>
                        Age/Region and timeline appear only if the contract provides the required data.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rep-section">
                  <h3>Voter Demographics (Who voted)</h3>
                  {!demographicsAvailable ? (
                    <div className="rep-card">
                      <center>
                        <strong>Not available</strong>
                        <p style={{ marginTop: 8, color: "grey" }}>
                          Contract does not expose voter list OR does not store age/region.
                        </p>
                      </center>
                    </div>
                  ) : (
                    <div className="rep-grid">
                      <div className="rep-card">
                        <h4>Voted by Age</h4>
                        {Object.keys(votedByAge).length === 0 ? (
                          <p style={{ color: "grey" }}>No voted voter data found.</p>
                        ) : (
                          <Doughnut
                            data={votedAgeData}
                            options={{ legend: { position: "bottom" }, cutoutPercentage: 45 }}
                          />
                        )}
                      </div>

                      <div className="rep-card">
                        <h4>Voted by Region</h4>
                        {Object.keys(votedByRegion).length === 0 ? (
                          <p style={{ color: "grey" }}>No voted voter data found.</p>
                        ) : (
                          <Doughnut
                            data={votedRegionData}
                            options={{ legend: { position: "bottom" }, cutoutPercentage: 45 }}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rep-section">
                  <h3>Votes Over Time</h3>
                  {!timelineAvailable ? (
                    <div className="rep-card">
                      <center>
                        <strong>Not available</strong>
                        <p style={{ marginTop: 8, color: "grey" }}>
                          No vote events found or event name differs in your contract.
                        </p>
                      </center>
                    </div>
                  ) : (
                    <div className="rep-card">
                      <Line
                        data={timelineData}
                        options={{
                          legend: { position: "bottom" },
                          scales: { yAxes: [{ ticks: { beginAtZero: true } }] },
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="rep-section rep-card">
                  <p style={{ color: "grey", margin: 0, textAlign: "center" }}>
                    Note : All data are fetched from Ethereum Blockchain
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }
}