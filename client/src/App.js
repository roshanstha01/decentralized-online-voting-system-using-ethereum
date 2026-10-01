import React, { Component } from "react";
import { BrowserRouter as Router, Switch, Route, Link } from "react-router-dom";

import Election from "./contracts/Election.json"; // Replace with your actual contract JSON
import getWeb3 from "./getWeb3";

import Home from "./component/Home";
import Voting from "./component/Voting/Voting";
import Results from "./component/Results/Results";
import Registration from "./component/Registration/Registration";
import AddCandidate from "./component/Admin/AddCandidate/AddCandidate";
import Verification from "./component/Admin/Verification/Verification";
import Report from "./component/Admin/Report/Report";

import test from "./component/test";
import Footer from "./component/Footer/Footer";

import "./App.css";

export default class App extends Component {
  state = { web3: null, accounts: null, contract: null, networkId: null };

  async componentDidMount() {
    try {
      const web3 = await getWeb3();
      const accounts = await web3.eth.getAccounts();
      const networkId = await web3.eth.net.getId();
      const deployedNetwork = Election.networks[networkId];

      if (!deployedNetwork) {
        alert("Smart contract not deployed to the detected network.");
        return;
      }

      const contract = new web3.eth.Contract(
        Election.abi,
        deployedNetwork.address
      );

      console.log("✅ Web3 loaded");
      console.log("Detected Network ID:", networkId);
      console.log(
        "Available networks in contract:",
        Object.keys(Election.networks)
      );

      this.setState({ web3, accounts, contract, networkId });
    } catch (error) {
      alert(
        "⚠️ Failed to load Web3, accounts, or contract. Check console for details."
      );
      console.error(error);
    }
  }

  render() {
    return (
      <div className="App">
        <Router>
          <Switch>
            <Route exact path="/" component={Home} />

            {/* Admin */}
            <Route exact path="/AddCandidate" component={AddCandidate} />
            <Route exact path="/Verification" component={Verification} />

            {/* Voter */}
            <Route exact path="/Registration" component={Registration} />
            <Route exact path="/Voting" component={Voting} />
            <Route exact path="/Results" component={Results} />

            {/* ✅ Report (NEW) */}
            <Route exact path="/Report" component={Report} />

            {/* Other */}
            <Route exact path="/test" component={test} />

            {/* 404 */}
            <Route exact path="*" component={NotFound} />
          </Switch>
        </Router>

        <Footer />
      </div>
    );
  }
}

class NotFound extends Component {
  render() {
    return (
      <>
        <h1>404 NOT FOUND!</h1>
        <center>
          <p>
            The page you are looking for doesn't exist.
            <br />
            Go to{" "}
            <Link to="/" style={{ color: "black", textDecoration: "underline" }}>
              Home
            </Link>
          </p>
        </center>
      </>
    );
  }
}