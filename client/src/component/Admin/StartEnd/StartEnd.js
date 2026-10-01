import React, { Component } from "react";

import Navbar from "../../Navbar/Navigation";
import NavbarAdmin from "../../Navbar/NavigationAdmin";

import AdminOnly from "../../AdminOnly";

import getWeb3 from "../../../getWeb3";
import Election from "../../../contracts/Election.json";

import "./StartEnd.css";

export default class StartEnd extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ElectionInstance: undefined,
      web3: null,
      account: null,
      isAdmin: false,

      elStarted: false,
      elEnded: false,

      loading: true,
      msg: "",
      lastRefreshAt: null,
    };
  }

  refreshTimer = null;
  accountTimer = null;

  // ✅ helper to safely call start/end/admin even if ABI differs
  callFirst = async (instance, methodNames = []) => {
    for (const name of methodNames) {
      try {
        if (instance?.methods?.[name]) {
          return await instance.methods[name]().call();
        }
      } catch (e) {}
    }
    return null;
  };

  refreshStatus = async ({ silent = true } = {}) => {
    try {
      const { web3, ElectionInstance } = this.state;
      if (!web3 || !ElectionInstance) return;

      if (!silent) this.setState({ loading: true });

      const accounts = await web3.eth.getAccounts();

      const admin = await this.callFirst(ElectionInstance, ["admin", "getAdmin"]);
      const isAdmin =
        accounts?.[0] && admin
          ? accounts[0].toLowerCase() === admin.toLowerCase()
          : false;

      const start = await this.callFirst(ElectionInstance, ["start", "getStart"]);
      const end = await this.callFirst(ElectionInstance, ["end", "getEnd"]);

      this.setState({
        account: accounts?.[0] || this.state.account,
        isAdmin,
        elStarted: Boolean(start),
        elEnded: Boolean(end),
        loading: false,
        lastRefreshAt: new Date(),
      });
    } catch (e) {
      console.error(e);
      this.setState({ loading: false });
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
        },
        async () => {
          await this.refreshStatus({ silent: false });
        }
      );

      // ✅ Auto-refresh election status (every 2 seconds)
      this.refreshTimer = setInterval(() => {
        this.refreshStatus({ silent: true });
      }, 2000);

      // ✅ Detect MetaMask account change
      this.accountTimer = setInterval(async () => {
        try {
          const acc = await web3.eth.getAccounts();
          if (acc?.[0] && acc[0] !== this.state.account) {
            this.setState({ account: acc[0] }, () =>
              this.refreshStatus({ silent: true })
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

  startElection = async () => {
    try {
      this.setState({ msg: "Starting election..." });

      await this.state.ElectionInstance.methods
        .startElection()
        .send({ from: this.state.account, gas: 1000000 });

      this.setState({ msg: "✅ Election started!" });
      await this.refreshStatus({ silent: true });
    } catch (err) {
      console.error(err);
      alert("Error starting election");
      this.setState({ msg: "❌ Error starting election" });
    }
  };

  endElection = async () => {
    try {
      this.setState({ msg: "Ending election..." });

      await this.state.ElectionInstance.methods
        .endElection()
        .send({ from: this.state.account, gas: 1000000 });

      this.setState({ msg: "✅ Election ended!" });
      await this.refreshStatus({ silent: true });
    } catch (err) {
      console.error(err);
      alert("Error ending election");
      this.setState({ msg: "❌ Error ending election" });
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

    if (!this.state.isAdmin) {
      return (
        <>
          <Navbar />
          <AdminOnly page="Start and end election page." />
        </>
      );
    }

    const { elStarted, elEnded, loading, msg, lastRefreshAt } = this.state;

    return (
      <>
        <NavbarAdmin />

        {!elStarted && !elEnded ? (
          <div className="container-item info">
            <center>The election has not been started yet.</center>
          </div>
        ) : null}

        <div className="container-main">
          <h3>Start or end election</h3>

          <small style={{ color: "grey" }}>
            Auto-refresh: every 2s
            {lastRefreshAt ? ` • Last: ${lastRefreshAt.toLocaleTimeString()}` : ""}
          </small>

          {msg ? (
            <div className="container-item info" style={{ marginTop: 10 }}>
              <center>{msg}</center>
            </div>
          ) : null}

          {loading ? (
            <div className="container-item info">
              <center>Loading election status...</center>
            </div>
          ) : (
            <>
              {!elStarted ? (
                <>
                  <div className="container-item">
                    <button onClick={this.startElection} className="start-btn">
                      Start {elEnded ? "Again" : ""}
                    </button>
                  </div>

                  {elEnded ? (
                    <div className="container-item">
                      <center>
                        <p>The election ended.</p>
                      </center>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="container-item">
                    <center>
                      <p>The election started.</p>
                    </center>
                  </div>

                  <div className="container-item">
                    <button onClick={this.endElection} className="start-btn">
                      End
                    </button>
                  </div>
                </>
              )}

              <div className="election-status">
                <p>Started: {elStarted ? "True" : "False"}</p>
                <p>Ended: {elEnded ? "True" : "False"}</p>
              </div>
            </>
          )}
        </div>
      </>
    );
  }
}