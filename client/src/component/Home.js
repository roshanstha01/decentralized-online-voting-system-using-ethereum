// Node modules
import React, { Component } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";

// Components
import Navbar from "./Navbar/Navigation";
import NavbarAdmin from "./Navbar/NavigationAdmin";
import UserHome from "./UserHome";
import StartEnd from "./StartEnd";
import ElectionStatus from "./ElectionStatus";

// Contract
import Web3 from "web3";
import Election from "../contracts/Election.json";

// CSS
import "./Home.css";

export default class Home extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ElectionInstance: undefined,
      account: null,
      web3: null,
      isAdmin: false,
      elStarted: false,
      elEnded: false,
      elDetails: {
        adminName: "",
        adminEmail: "",
        adminTitle: "",
        electionTitle: "",
        organizationTitle: "",
      },
    };
  }

  // ✅ Parses description like:
  // "Organization: X | Admin: Y Z | Title: T | Email: E"
  // and safely falls back if description is plain text.
  parseElectionDescription = (desc) => {
    const result = {
      organizationTitle: "",
      adminName: "",
      adminTitle: "",
      adminEmail: "",
    };

    if (!desc || typeof desc !== "string") return result;

    // If it's not in your "Organization: ... | Admin: ..." format, treat whole thing as organizationTitle
    const looksFormatted =
      desc.includes("|") &&
      (desc.toLowerCase().includes("organization:") ||
        desc.toLowerCase().includes("admin:") ||
        desc.toLowerCase().includes("title:") ||
        desc.toLowerCase().includes("email:"));

    if (!looksFormatted) {
      result.organizationTitle = desc.trim();
      return result;
    }

    const parts = desc.split("|").map((p) => p.trim());

    for (const p of parts) {
      const lower = p.toLowerCase();
      if (lower.startsWith("organization:")) {
        result.organizationTitle = p.split(":").slice(1).join(":").trim();
      } else if (lower.startsWith("admin:")) {
        result.adminName = p.split(":").slice(1).join(":").trim();
      } else if (lower.startsWith("title:")) {
        result.adminTitle = p.split(":").slice(1).join(":").trim();
      } else if (lower.startsWith("email:")) {
        result.adminEmail = p.split(":").slice(1).join(":").trim();
      }
    }

    return result;
  };

  componentDidMount = async () => {
    try {
      if (!window.ethereum) {
        alert("Please install MetaMask to use this DApp!");
        return;
      }

      // ✅ Connect to MetaMask
      const web3 = new Web3(window.ethereum);
      await window.ethereum.request({ method: "eth_requestAccounts" });

      const accounts = await web3.eth.getAccounts();
      const networkId = await web3.eth.net.getId();
      const deployedNetwork = Election.networks[networkId];

      // ✅ Check if contract is deployed on this network
      if (!deployedNetwork) {
        alert("Smart contract not deployed to the detected network.");
        return;
      }

      const electionInstance = new web3.eth.Contract(
        Election.abi,
        deployedNetwork.address
      );

      this.setState({
        web3,
        ElectionInstance: electionInstance,
        account: accounts[0],
      });

      // ✅ Check if current account is admin
      const admin = await electionInstance.methods.admin().call();
      if (accounts[0].toLowerCase() === admin.toLowerCase()) {
        this.setState({ isAdmin: true });
      }

      // ✅ Get election start/end
      const start = await electionInstance.methods.start().call();
      const end = await electionInstance.methods.end().call();

      // ✅ Get election info
      const electionName = await electionInstance.methods.electionName().call();
      const electionDescription = await electionInstance.methods
        .electionDescription()
        .call();

      const parsed = this.parseElectionDescription(electionDescription);

      this.setState({
        elStarted: start,
        elEnded: end,
        elDetails: {
          electionTitle: electionName || "",
          organizationTitle: parsed.organizationTitle || "",

          adminName: parsed.adminName || "",
          adminTitle: parsed.adminTitle || "",
          adminEmail: parsed.adminEmail || "",
        },
      });

      // ✅ Handle MetaMask changes
      window.ethereum.on("accountsChanged", () => window.location.reload());
      window.ethereum.on("chainChanged", () => window.location.reload());
    } catch (error) {
      console.error(error);
      alert("Error connecting to blockchain. See console for details.");
    }
  };

  // ✅ End election
  endElection = async () => {
    try {
      await this.state.ElectionInstance.methods
        .endElection()
        .send({ from: this.state.account, gas: 1000000 });
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Error ending election");
    }
  };

  // ✅ Register + Start election
  registerElection = async (data) => {
    try {
      const electionTitle = (data.electionTitle || "").trim();
      const orgTitle = (data.organizationTitle || "").trim();

      const fullName = `${data.adminFName || ""} ${data.adminLName || ""}`.trim();

      // Store as formatted description so it can be parsed for perfect alignment
      const description = `Organization: ${orgTitle} | Admin: ${fullName} | Title: ${
        data.adminTitle || ""
      } | Email: ${data.adminEmail || ""}`;

      // 1) set name + description
      await this.state.ElectionInstance.methods
        .setElectionInfo(electionTitle, description)
        .send({ from: this.state.account, gas: 1500000 });

      // 2) start election
      await this.state.ElectionInstance.methods
        .startElection()
        .send({ from: this.state.account, gas: 1000000 });

      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Error registering/starting election");
    }
  };

  render() {
    const { web3, isAdmin, account, elStarted, elEnded, elDetails } = this.state;

    if (!web3) {
      return (
        <>
          <Navbar />
          <center>Loading Web3, accounts, and contract...</center>
        </>
      );
    }

    return (
      <>
        {isAdmin ? <NavbarAdmin /> : <Navbar />}

        <div className="container-main">
          <div className="container-item center-items info">
            Your Account: {account}
          </div>

          {!elStarted && !elEnded && (
            <div className="container-item info">
              <center>
                <h3>The election has not been started.</h3>
                {isAdmin ? <p>Set up and start the election.</p> : <p>Please wait...</p>}
              </center>
            </div>
          )}
        </div>

        {isAdmin ? (
          <this.renderAdminHome />
        ) : elStarted ? (
          <UserHome el={elDetails} />
        ) : !elStarted && elEnded ? (
          <div className="container-item attention">
            <center>
              <h3>The Election ended.</h3>
              <br />
              <Link to="/Results" style={{ color: "black", textDecoration: "underline" }}>
                See results
              </Link>
            </center>
          </div>
        ) : null}
      </>
    );
  }

  renderAdminHome = () => {
    const EMsg = (props) => <span style={{ color: "tomato" }}>{props.msg}</span>;

    const AdminHome = () => {
      const {
        handleSubmit,
        register,
        formState: { errors },
      } = useForm();

      const onSubmit = (data) => {
        this.registerElection(data);
      };

      return (
        <form onSubmit={handleSubmit(onSubmit)}>
          {!this.state.elStarted && !this.state.elEnded ? (
            <div className="container-main">
              {/* About Admin */}
              <div className="about-admin">
                <h3>About Admin</h3>
                <div className="container-item center-items">
                  <div>
                    <label className="label-home">
                      Full Name {errors.adminFName && <EMsg msg="*required" />}
                      <input
                        className="input-home"
                        type="text"
                        placeholder="First Name"
                        {...register("adminFName", { required: true })}
                      />
                      <input
                        className="input-home"
                        type="text"
                        placeholder="Last Name"
                        {...register("adminLName")}
                      />
                    </label>

                    <label className="label-home">
                      Email {errors.adminEmail && <EMsg msg={errors.adminEmail.message} />}
                      <input
                        className="input-home"
                        placeholder="you@example.com"
                        {...register("adminEmail", {
                          required: "*Required",
                          pattern: {
                            value: /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,4}$/,
                            message: "*Invalid email",
                          },
                        })}
                      />
                    </label>

                    <label className="label-home">
                      Job Title or Position {errors.adminTitle && <EMsg msg="*required" />}
                      <input
                        className="input-home"
                        type="text"
                        placeholder="e.g. HOD"
                        {...register("adminTitle", { required: true })}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* About Election */}
              <div className="about-election">
                <h3>About Election</h3>
                <div className="container-item center-items">
                  <div>
                    <label className="label-home">
                      Election Name {errors.electionTitle && <EMsg msg="*required" />}
                      <input
                        className="input-home"
                        type="text"
                        placeholder="e.g. College Election"
                        {...register("electionTitle", { required: true })}
                      />
                    </label>

                    <label className="label-home">
                      Organization / Description{" "}
                      {errors.organizationTitle && <EMsg msg="*required" />}
                      <input
                        className="input-home"
                        type="text"
                        placeholder="e.g. NEC / Department / Details"
                        {...register("organizationTitle", { required: true })}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ) : this.state.elStarted ? (
            <UserHome el={this.state.elDetails} />
          ) : null}

          <StartEnd
            elStarted={this.state.elStarted}
            elEnded={this.state.elEnded}
            endElFn={this.endElection}
          />

          <ElectionStatus elStarted={this.state.elStarted} elEnded={this.state.elEnded} />
        </form>
      );
    };

    return <AdminHome />;
  };
}