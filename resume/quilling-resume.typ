#set document(title: "Timothy Quilling - Resume", author: "Timothy Quilling")
#set page(margin: 0.75in)
#set text(font: "Libertinus Serif", size: 10pt)
#set par(leading: 0.65em)

#let section(title) = [
  #v(0.8em)
  #text(size: 14pt, fill: rgb("#888888"))[#title]
  #v(-0.2em)
  #line(length: 100%, stroke: 0.5pt + rgb("#cccccc"))
  #v(-0.2em)
]

#let role(company, title, dates) = [
  #text(size: 13pt, weight: "medium")[#company] \
  #text(fill: rgb("#666666"), size: 10pt)[#title | #dates]
]

#text(size: 28pt, weight: "bold")[TIMOTHY QUILLING]

#v(-0.3em)
DevOps Engineer, B.S. Information Systems Technology | #link("https://quilling.dev")[quilling.dev] | #link("mailto:teqed@shatteredsky.net")[teqed\@shatteredsky.net]

#v(0.6em)
Timothy Quilling has eight years of experience across systems administration, DevOps, and full-stack software delivery, with a passion for building software that solves real-world problems.

#section[Education]

#role("Seminole State College", "B.S. Information Systems Technology", "2012 - 2017")
- Specialized in Cybersecurity and graduated with an Honors Science Diploma.

#section[Experience]

#role("Stelo, a StarQuest company", "DevOps Engineer", "Sept 2025 - Present")
- Own CI/CD and release tooling for our data replication product's Java and C++ codebases.
- Develop new features in product code and company infrastructure.
- Lead deep investigations during the sales cycle to surface edge cases and scope new features.
- Maintain internal infrastructure across VMware, Azure, and AWS.
- Support customer deployments spanning DB2, IBM i, BigQuery, Databricks, and other RDBMS.

#role("CentralSquare Technologies", "Systems Administrator", "Apr 2019 - Apr 2025")
- Managed a suite of government ERP software for municipalities in the US and Canada.
- Provided 24/7 on-call support to maintain 99.9% availability in accordance with SLOs.
- Developed automation rule sets to recover from service interruptions.
- Handled high-pressure technical escalations driven by financial deadlines.
- Built self-service tools for UX and domain operations using CL, Python, and PowerShell.
- Maintained back-end .NET applications and IIS hosting on Windows Servers in AWS.
- Managed Node.js instances serving applications to thousands of daily active users.

#role("Charter Communications", "Internet Technical Support, Tier 3", "Jun 2018 - Apr 2019")
- Acted as a subject matter expert for last-mile networking, including modems and routers.
- Supported web applications for customer account management and live streaming services.

#section[Skills]

- Designing and operating CI/CD pipelines for complex, multi-language codebases.
- Deploying hosted services on cloud providers, including Azure, AWS, and Oracle Cloud.
- Maintaining Microsoft Windows, Linux, IBM i OS, and other POSIX-compliant systems.
- Optimizing and auditing large multi-user databases in SQLite, PostgreSQL, and IBM DB2.
- Integrating with modern data platforms including BigQuery and Databricks.
- Creating declarative infrastructure using IaC tools like Terraform, Ansible, and Nix Flakes.
- Working with REST APIs, including OAuth, CDN storage, SSL/TLS, and managing certificates.
- Writing software in Rust and contributing to Python, Java, JavaScript, C\#, and Go codebases.
