// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Election {
    address public admin;

    // name + description at deploy
    string public electionName;
    string public electionDescription;

    uint256 public candidateCount;
    uint256 public voterCount;

    bool public start;
    bool public end;

    // Events for analytics (frontend can read logs)
    event ElectionInfoSet(string name, string description);
    event CandidateAdded(uint256 indexed candidateId, string name, string party, string region);
    event VoterRegistered(address indexed voter);
    event VoterVerified(address indexed voter, bool status);
    event VoteCast(address indexed voter, uint256 indexed candidateId);

    // ✅ NEW EVENTS for Email Notifier (Node server will listen to these)
    event ElectionStarted(uint256 timestamp);
    event ElectionEnded(uint256 timestamp);

    constructor(string memory _name, string memory _description) {
        admin = msg.sender;
        electionName = _name;
        electionDescription = _description;

        candidateCount = 0;
        voterCount = 0;
        start = false;
        end = false;

        emit ElectionInfoSet(_name, _description);
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    // Optional: change later without redeploy
    function setElectionInfo(string memory _name, string memory _description) public onlyAdmin {
        electionName = _name;
        electionDescription = _description;
        emit ElectionInfoSet(_name, _description);
    }

    // ---------------- CANDIDATES (Excel-ready) ----------------
    struct Candidate {
        uint256 candidateId;
        string name;
        string party;
        string symbol; // store filename like "tree.png" or URL/IPFS
        uint256 age;
        string gender;
        string region;
        uint256 voteCount;
    }

    mapping(uint256 => Candidate) public candidateDetails;

    function addCandidate(
        string memory _name,
        string memory _party,
        string memory _symbol,
        uint256 _age,
        string memory _gender,
        string memory _region
    ) public onlyAdmin {
        uint256 id = candidateCount;
        candidateDetails[id] = Candidate(id, _name, _party, _symbol, _age, _gender, _region, 0);
        candidateCount += 1;

        emit CandidateAdded(id, _name, _party, _region);
    }

    // Batch add candidates (frontend should chunk, e.g., 20–50 rows per tx)
    function addCandidatesBatch(
        string[] memory _name,
        string[] memory _party,
        string[] memory _symbol,
        uint256[] memory _age,
        string[] memory _gender,
        string[] memory _region
    ) public onlyAdmin {
        require(
            _name.length == _party.length &&
            _party.length == _symbol.length &&
            _symbol.length == _age.length &&
            _age.length == _gender.length &&
            _gender.length == _region.length,
            "Length mismatch"
        );

        for (uint256 i = 0; i < _name.length; i++) {
            uint256 id = candidateCount;
            candidateDetails[id] = Candidate(
                id,
                _name[i],
                _party[i],
                _symbol[i],
                _age[i],
                _gender[i],
                _region[i],
                0
            );
            candidateCount += 1;

            emit CandidateAdded(id, _name[i], _party[i], _region[i]);
        }
    }

    // ---------------- VOTERS (Excel-ready + demographics) ----------------
    struct Voter {
        address voterAddress;
        string name;
        string phone;
        string email;
        uint256 age;
        string gender;
        string region;

        bool isVerified;
        bool hasVoted;
        bool isRegistered;
    }

    mapping(address => Voter) public voterDetails;
    address[] public voters;

    // Self-register (now includes demographics)
    function registerAsVoter(
        string memory _name,
        string memory _phone,
        string memory _email,
        uint256 _age,
        string memory _gender,
        string memory _region
    ) public {
        require(_age > 0, "Invalid age");

        bool already = voterDetails[msg.sender].isRegistered;

        voterDetails[msg.sender] = Voter(
            msg.sender,
            _name,
            _phone,
            _email,
            _age,
            _gender,
            _region,
            false,
            false,
            true
        );

        // Only count/push first time
        if (!already) {
            voters.push(msg.sender);
            voterCount += 1;
            emit VoterRegistered(msg.sender);
        }
    }

    // Supervisor: Excel import voters (address + demographics)
    function registerVotersBatch(
        address[] memory _addr,
        string[] memory _name,
        string[] memory _phone,
        string[] memory _email,
        uint256[] memory _age,
        string[] memory _gender,
        string[] memory _region
    ) public onlyAdmin {
        require(
            _addr.length == _name.length &&
            _name.length == _phone.length &&
            _phone.length == _email.length &&
            _email.length == _age.length &&
            _age.length == _gender.length &&
            _gender.length == _region.length,
            "Length mismatch"
        );

        for (uint256 i = 0; i < _addr.length; i++) {
            address v = _addr[i];
            require(_age[i] > 0, "Invalid age");

            if (!voterDetails[v].isRegistered) {
                voterDetails[v] = Voter(
                    v,
                    _name[i],
                    _phone[i],
                    _email[i],
                    _age[i],
                    _gender[i],
                    _region[i],
                    false,
                    false,
                    true
                );
                voters.push(v);
                voterCount += 1;
                emit VoterRegistered(v);
            } else {
                // If already registered, update info (optional)
                voterDetails[v].name = _name[i];
                voterDetails[v].phone = _phone[i];
                voterDetails[v].email = _email[i];
                voterDetails[v].age = _age[i];
                voterDetails[v].gender = _gender[i];
                voterDetails[v].region = _region[i];
            }
        }
    }

    function verifyVoter(bool _verifiedStatus, address voterAddress) public onlyAdmin {
        require(voterDetails[voterAddress].isRegistered, "Not registered");
        voterDetails[voterAddress].isVerified = _verifiedStatus;
        emit VoterVerified(voterAddress, _verifiedStatus);
    }

    // ---------------- ELECTION CONTROL ----------------
    function startElection() public onlyAdmin {
        require(!start && !end, "Already started/ended");
        start = true;
        end = false;

        // ✅ Event for notifier
        emit ElectionStarted(block.timestamp);
    }

    function endElection() public onlyAdmin {
        require(start && !end, "Election not active");
        end = true;
        start = false;

        // ✅ Event for notifier
        emit ElectionEnded(block.timestamp);
    }

    // ---------------- VOTING ----------------
    function vote(uint256 candidateId) public {
        require(start == true && end == false, "Election not active");
        require(voterDetails[msg.sender].isRegistered, "Not registered");
        require(voterDetails[msg.sender].isVerified, "Not verified");
        require(!voterDetails[msg.sender].hasVoted, "Already voted");
        require(candidateId < candidateCount, "Invalid candidate");

        candidateDetails[candidateId].voteCount += 1;
        voterDetails[msg.sender].hasVoted = true;

        emit VoteCast(msg.sender, candidateId);
    }
}