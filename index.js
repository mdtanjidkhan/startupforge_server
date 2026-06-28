const express = require('express');
const app = express()
const cors = require('cors')
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { jwtVerify, createRemoteJWKSet } = require('jose-cjs');

const PORT = process.env.PORT
app.use(cors());
app.use(express.json());
const uri = process.env.MONGODB_URI;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.get('/', (req, res) => {
  res.send('Hello World!')
})

 const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'Unauthorized access: Missing token header' });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access: Token not found' });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload; 
    console.log("Verified User Payload:", payload); // 
    
    next(); 
  } catch (error) {
    console.error("Token Verification Error:", error.message);
    return res.status(403).send({ message: 'Forbidden access: Invalid or expired token' });
  }
};


async function run() {
  try {
    
    // await client.connect();

     const database = client.db("StartupForge");
     const opportunitiesCollection = database.collection("opportunities");
     const startupsCollection = database.collection("startups");
     const applicationsCollection = database.collection("applications");
     const profilesCollection = database.collection("profiles");
      const paymentsCollection = database.collection('payments');

  // opportunities 
app.post('/api/opportunities', verifyToken, async (req, res) => {
  try {
    const opportunityData = req.body;
    if (!opportunityData.role_title || !opportunityData.required_skills || !opportunityData.work_type || !opportunityData.commitment_level || !opportunityData.deadline) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const founderEmail = opportunityData.founder_email || "founder@example.com";
    const hasPaid = await paymentsCollection.findOne({ userEmail: founderEmail, status: "completed" });
    const isUserPremium = !!hasPaid; 
    const totalExistingPosts = await opportunitiesCollection.countDocuments({ founder_email: founderEmail });
    if (totalExistingPosts >= 3 && !isUserPremium) {
      return res.status(403).json({ 
        success: false, 
        premiumRequired: true, 
        message: "You have reached your limit of 3 free posts. Please upgrade to premium to post more!" 
      });
    }

    const newOpportunity = {
      ...opportunityData,
      founder_email: founderEmail, 
      isPremium: isUserPremium, 
      created_at: new Date()
    };

    const result = await opportunitiesCollection.insertOne(newOpportunity);
    res.status(201).json({ 
      success: true, 
      message: "Opportunity published successfully!", 
      insertedId: result.insertedId 
    });

  } catch (error) {
    console.error("Error inserting opportunity:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

app.post('/api/create-checkout-session', verifyToken, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "User email is required" });
    }
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'StartupForge Pro Membership',
              description: 'Unlock unlimited opportunity posts and premium features',
            },
            unit_amount: 1900, 
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: email,
      success_url: `${process.env.CLIENT_URL}/dashboard/overview/my-startup/add-opportunity?payment_success=true`,
      cancel_url: `${process.env.CLIENT_URL}/dashboard/overview/my-startup/add-opportunity?payment_cancel=true`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe session creation error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// payment collcation
app.post('/api/payments/success', async (req, res) => {
  try {
    const { email, amount, transactionId, status } = req.body;

    if (!email || !transactionId) {
      return res.status(400).json({ success: false, message: "Missing payment details" });
    }

    const paymentReceipt = {
      userEmail: email,
      amount: amount || 19,
      transactionId: transactionId,
      status: status || "completed",
      paidAt: new Date()
    };

    const result = await paymentsCollection.insertOne(paymentReceipt);

    res.status(201).json({ 
      success: true, 
      message: "Payment recorded successfully in database!",
      paymentId: result.insertedId 
    });
  } catch (error) {
    console.error("Error saving payment:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});
// paymet get
app.get('/api/payments/check-premium', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email parameter is required" });
    }
    const payment = await paymentsCollection.findOne({ 
      userEmail: email, 
      status: "completed" 
    });

    if (payment) {
      return res.json({ success: true, isPremium: true });
    } else {
      return res.json({ success: false, isPremium: false });
    }
  } catch (error) {
    console.error("Error checking premium status:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});



// 
app.get('/api/my-opportunities', async (req, res) => {
  try {
    const { email } = req.query; 
    if (!email) {
      return res.status(400).json({ success: false, message: "Founder email query is required!" });
    }

    const query = { founder_email: email };
    const result = await opportunitiesCollection.find(query).toArray();
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching my opportunities:", error);
    res.status(500).json({ success: false, message: "Error fetching data" });
  }
});

// count cl

app.get('/api/collaborator-stats', async (req, res) => {
  try {
    const email = req.query.email;
    
    if (!email) {
      return res.status(400).json({ success: false, message: "Collaborator email is required" });
    }
    const totalCount = await applicationsCollection.countDocuments({ 
     applicant_email: email });
    const pendingCount = await applicationsCollection.countDocuments({ 
      
      applicant_email: email, 
      status: "pending" 
    });
    const rejectedCount = await applicationsCollection.countDocuments({ 
      
      applicant_email: email, 
      status: "rejected" 
    });
    res.json({
      success: true,
      total: totalCount,
      pending: pendingCount,
      rejected: rejectedCount
    });

  } catch (error) {
    console.error("Error fetching collaborator stats:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

app.get('/api/opportunities', async (req, res) => {
  try {
    const { search, work_type, commitment_level } = req.query;
    let query = {};
    if (search) {
      query.role_title = { $regex: search, $options: "i" };
    }

    if (work_type) {
      query.work_type = work_type;
    }
    if (commitment_level) {
      query.commitment_level = commitment_level;
    }
    const result = await opportunitiesCollection
      .find(query)
      .sort({ created_at: -1 })
      .toArray();

    res.status(200).json(result);
  } catch (error) {
    console.error("Backend Error fetching opportunities:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// opportunities
app.patch('/api/opportunities/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body; 
    const filter = { _id: new ObjectId(id) };
    const updateDoc = { $set: {} };

    if (updatedData.role_title) updateDoc.$set.role_title = updatedData.role_title;
    if (updatedData.required_skills) updateDoc.$set.required_skills = updatedData.required_skills;
    if (updatedData.work_type) updateDoc.$set.work_type = updatedData.work_type;
    if (updatedData.commitment_level) updateDoc.$set.commitment_level = updatedData.commitment_level;
    if (updatedData.deadline) updateDoc.$set.deadline = updatedData.deadline;

    if (Object.keys(updateDoc.$set).length === 0) {
      return res.status(400).json({ success: false, message: "No valid fields provided for update" });
    }

    const result = await opportunitiesCollection.updateOne(filter, updateDoc);
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Opportunity not found" });
    }

    res.status(200).json({ 
      success: true, 
      message: "Opportunity updated successfully!", 
      result 
    });
  } catch (error) {
    console.error("Error updating with PATCH:", error);
    res.status(500).json({ success: false, message: "Error updating opportunity" });
  }
});


app.delete('/api/opportunities/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await opportunitiesCollection.deleteOne(query);
    res.status(200).json({ success: true, message: "Opportunity deleted successfully!", result });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting opportunity" });
  }
});

// founder overview 

app.get('/api/founder/overview', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ success: false, message: "Founder email is required" });
    }
    const [totalStartups, totalOpportunities, totalApplicants, recentApplications] = await Promise.all([
      startupsCollection.countDocuments({ founder_email: email }),
      opportunitiesCollection.countDocuments({ founder_email: email }),
      applicationsCollection.countDocuments({ founder_email: email }),
      applicationsCollection.find({ founder_email: email })
        .sort({ applied_at: -1 }) 
        .limit(5)                 
        .toArray()
    ]);
    const formattedApplications = recentApplications.map(app => ({
      id: app._id.toString(),
      applicant_name: app.applicant_name,
      applicant_email: app.applicant_email,
      role_title: app.role_title,
      status: app.status || "Pending",
      portfolio_link: app.portfolio_link,
      applied_at: app.applied_at ? new Date(app.applied_at).toLocaleDateString("en-US", {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) : "N/A"
    }));

    res.json({
      success: true,
      analytics: {
        myStartups: totalStartups,
        activeRoles: totalOpportunities,
        totalApplicants: totalApplicants
      },
      recentApplications: formattedApplications
    });

  } catch (error) {
    console.error("Error fetching founder overview:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});





// STARTUP PROFILE ROLE

app.get('/api/my-startup', async (req, res) => {
  try {
    const { email } = req.query; 
    if (!email) {
      return res.status(400).json({ success: false, message: "Founder email query is required!" });
    }
    const startup = await startupsCollection.findOne({ founder_email: email }); 
    if (!startup) {
      return res.status(200).json({ success: false, message: "No startup workspace registered for this user." });
    }
    res.status(200).json({ success: true, data: startup });
  } catch (error) {
    console.error("Error fetching startup profile:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});


app.post('/api/my-startup',verifyToken, async (req, res) => {
  try {
    const { startup_name, logo, industry, description, funding_stage, founder_email } = req.body;

    const newStartup = {
      startup_name,
      logo,
      industry,
      description,
      funding_stage,
      founder_email: founder_email || "founder@example.com",
      status: "Pending"
    };
    const result = await startupsCollection.insertOne(newStartup);
    const savedProfile = await startupsCollection.findOne({ _id: result.insertedId });
    res.status(201).json({ 
      success: true, 
      message: "Startup workspace registered!",
      data: savedProfile 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

//   (PATCH) NOW
app.patch('/api/my-startup/:id',verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (updates._id) delete updates._id;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = { $set: updates };
    const result = await startupsCollection.updateOne(filter, updateDoc);
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Startup profile not found." });
    }
    const updatedProfile = await startupsCollection.findOne(filter);

    res.status(200).json({ 
      success: true, 
      message: "Startup workspace updated successfully!",
      data: updatedProfile 
    });
  } catch (error) {
    console.error("Error updating startup profile:", error);
    res.status(500).json({ success: false, message: "Server error while saving updates." });
  }
});

//   (DELETE)
app.delete('/api/my-startup/:id',verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await startupsCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "Startup profile not found or already deleted." });
    }
    res.status(200).json({ 
      success: true, 
      message: "Startup profile deleted successfully from forge workspace!" 
    });
  } catch (error) {
    console.error("Error deleting startup workspace:", error);
    res.status(500).json({ success: false, message: "Server error during elimination." });
  }
});



//  APPLICATIONS MANAGEMENT 

app.post('/api/applications', verifyToken, async (req, res) => {
  try {
    const applicationData = req.body;
    if (applicationData.applicant_email === applicationData.founder_email) {
      return res.status(400).json({ 
        success: false, 
        message: "You are the founder of this opportunity! You cannot apply to your own post." 
      });
    }
    if (applicationData.userRole === "Founder") {
      return res.status(403).json({
        success: false,
        message: "Access Denied: Startup Founders are not allowed to apply for opportunities!"
      });
    }

    const result = await applicationsCollection.insertOne({
      opportunity_id: applicationData.opportunity_id,
      role_title: applicationData.role_title,
      founder_email: applicationData.founder_email,
      applicant_name: applicationData.applicant_name,
      applicant_email: applicationData.applicant_email,
      portfolio_link: applicationData.portfolio_link,
      motivation_message: applicationData.motivation_message,
      status: "Pending", 
      applied_at: new Date(applicationData.applied_at)
    });

    if (result.insertedId) {
      res.status(201).json({ success: true, message: "Application submitted successfully! " });
    } else {
      res.status(500).json({ success: false, message: "Failed to submit application." });
    }

  } catch (error) {
    console.error("Error inserting application:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// 

app.get('/api/my-applications', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, message: "Applicant email query is required!" });
    }
    const pipeline = [
      { $match: { applicant_email: email } },
      {
        $lookup: {
          from: "opportunities",          
          localField: "opportunity_id",   
          foreignField: "_id",           
          as: "opportunity_details"       
        }
      },
      {
        $unwind: {
          path: "$opportunity_details",
          preserveNullAndEmptyArrays: true 
        }
      },
      {
        $project: {
          _id: 1,
          applicant_email: 1,
          portfolio_link: 1,
          motivation_message: 1,
          status: { $ifNull: ["$status", "Pending"] }, 
          applied_at: 1,
          role_title: { $ifNull: ["$opportunity_details.role_title", "$role_title", "N/A"] },
          startup_name: { $ifNull: ["$opportunity_details.startup_name", "N/A"] } 
        }
      },
      { $sort: { applied_at: -1 } }
    ];

    const result = await applicationsCollection.aggregate(pipeline).toArray();
    res.status(200).json(result);

  } catch (error) {
    console.error("Backend error fetching my applications:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});


app.get('/api/founder-applications', async (req, res) => {
  try {
    const { email } = req.query; 
    if (!email) {
      return res.status(400).json({ success: false, message: "Founder email is required!" });
    }
    const pipeline = [
      { $match: { founder_email: email } },
      {
        $lookup: {
          from: "opportunities",
          localField: "opportunity_id",
          foreignField: "_id", 
          as: "opportunity_details"
        }
      },
      {
        $unwind: {
          path: "$opportunity_details",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          opportunity_id: 1,
          applicant_name: 1,
          applicant_email: 1,
          portfolio_link: 1,
          motivation_message: 1,
          status: { $ifNull: ["$status", "Pending"] },
          applied_at: 1,
          role_title: { $ifNull: ["$opportunity_details.role_title", "$role_title", "N/A"] }
        }
      },
      { $sort: { applied_at: -1 } }
    ];
    const applications = await applicationsCollection.aggregate(pipeline).toArray();
    res.status(200).json(applications);
  } catch (error) {
    console.error("Error fetching founder applications:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});


app.patch('/api/applications/status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; 
    
    if (!["Accepted", "Rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status update" });
    }
    const filter = { _id: new ObjectId(id) };
    const updateDoc = { $set: { status: status } };
    
    const result = await applicationsCollection.updateOne(filter, updateDoc);
    
    if (result.matchedCount > 0) {
      res.status(200).json({ 
        success: true, 
        message: `Application ${status.toLowerCase()} successfully!` 
      });
    } else {
      res.status(404).json({ success: false, message: "Application not found in database." });
    }
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// profile 

app.get('/api/collaborator-profile', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email query is required!" });
    }
    const profile = await profilesCollection.findOne({ email: email });
    res.status(200).json(profile || {});
  } catch (error) {
    console.error("Error fetching collaborator profile:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// 

app.put('/api/collaborator-profile', async (req, res) => {
  try {
    const { name, email, image, skills, bio } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required to update profile!" });
    }
    const filter = { email: email };
    const updateDoc = {
      $set: {
        name: name,
        image: image,
        skills: skills || [],
        bio: bio,
        updated_at: new Date() 
      }
    };
    const options = { upsert: true };

    const result = await profilesCollection.updateOne(filter, updateDoc, options);
    res.status(200).json({ 
      success: true, 
      message: "Profile updated successfully! ✨",
      result 
    });

  } catch (error) {
    console.error("Error updating collaborator profile:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// admin jonno 

app.get('/api/admin/analytics', async (req, res) => {
  try {
    const totalUsers = await database.collection('user').countDocuments();
    const totalStartups = await startupsCollection.countDocuments();

    const totalOpportunities = await opportunitiesCollection.countDocuments();
    const revenueData = await paymentsCollection.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]).toArray();
    const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;

    res.json({
      success: true,
      totalUsers,
      totalStartups,
      totalOpportunities,
      totalRevenue
    });

  } catch (error) {
    console.error("Admin analytics API error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});
// view users 

app.get('/api/admin/users', async (req, res) => {
  try {
  
    const users = await database.collection("user").find({}).toArray();
    
    const safeUsers = users.map(user => ({
      id: user._id || user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role || "user",
     
      isBlocked: user.isBlocked ?? false 
    }));

    res.json({ success: true, users: safeUsers });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
});

app.patch('/api/admin/users/block', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }
    const result = await database.collection("user").updateOne(
      { email: email },
      { $set: { isBlocked: true } }
    );

    if (result.modifiedCount > 0) {
      res.json({ success: true, message: "User blocked successfully" });
    } else {
      res.status(404).json({ success: false, message: "User not found or already blocked" });
    }
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch('/api/admin/users/unblock', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }
    const result = await database.collection("user").updateOne(
      { email: email },
      { $set: { isBlocked: false } }
    );

    if (result.modifiedCount > 0) {
      res.json({ success: true, message: "User unblocked successfully" });
    } else {
      res.status(404).json({ success: false, message: "User not found or already active" });
    }
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});
// block user 

app.get("/api/dashboard/overview", async (req, res) => {
  try {
    const userEmail = req.user?.email; 

    if (!userEmail) {
      return res.status(401).json({ success: false, message: "Unauthorized access" });
    }
    const dbUser = await database.collection("user").findOne({ email: userEmail });
    if (dbUser && dbUser.isBlocked === true) {
      return res.status(403).json({ 
        success: false, 
        isBlocked: true, 
        message: "Your account has been suspended by the administrator." 
      });
    }
    res.json({ 
      success: true, 
      message: "Success",
      data: {  } 
    });

  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// 

app.get('/api/admin/startups', async (req, res) => {
  try {
    const startups = await startupsCollection.find({}).toArray();
    
    const formattedStartups = startups.map(startup => ({
      id: startup._id.toString(),
      startup_name: startup.startup_name,
      logo: startup.logo,
      industry: startup.industry,
      description: startup.description,
      funding_stage: startup.funding_stage,
      founder_email: startup.founder_email,
      status: startup.status || "Pending"
    }));

    res.json({ success: true, startups: formattedStartups });
  } catch (error) {
    console.error("Error fetching startups:", error);
    res.status(500).json({ success: false, message: "Failed to fetch startups" });
  }
});

// approed korar jonno
app.patch('/api/admin/startups/approve', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: "Startup ID is required" });
    }
    const result = await startupsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "Approved" } }
    );

    if (result.modifiedCount > 0) {
      res.json({ success: true, message: "Startup approved successfully! " });
    } else {
      res.status(404).json({ success: false, message: "Startup not found or already approved" });
    }
  } catch (error) {
    console.error("Error approving startup:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});
// rejected korar jonno api

app.patch('/api/admin/startups/reject', async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "Startup ID is required" });
    }
    const result = await startupsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "Rejected" } }
    );

    if (result.modifiedCount > 0) {
      res.json({ success: true, message: "Startup removed/rejected successfully! " });
    } else {
      res.status(404).json({ success: false, message: "Startup not found or already rejected" });
    }
  } catch (error) {
    console.error("Error rejecting startup:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});
// payments transactions

app.get('/api/admin/transactions', async (req, res) => {
  try {
    const payments = await paymentsCollection.find({}).sort({ paidAt: -1 }).toArray();
    
    const formattedPayments = payments.map(payment => ({
      id: payment._id.toString(),
      userEmail: payment.userEmail,
      amount: payment.amount,
      transactionId: payment.transactionId,
      status: payment.status || "pending",
      paidAt: payment.paidAt ? new Date(payment.paidAt).toLocaleDateString("en-US", {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : "N/A"
    }));

    res.json({ success: true, transactions: formattedPayments });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ success: false, message: "Failed to fetch transactions" });
  }
});


// google 
app.patch('/api/user/update-role', async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ success: false, message: "Email and Role are required" });
    }

    if (role !== "founder" && role !== "collaborator") {
      return res.status(400).json({ success: false, message: "Invalid role selected" });
    }
    const result = await database.collection("user").updateOne(
      { email: email }, 
      { $set: { role: role } } 
    );

    if (result.modifiedCount > 0) {
      res.json({ success: true, message: `Role updated to ${role} successfully! ` });
    } else {
      res.status(404).json({ success: false, message: "User not found or role already set" });
    }

  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});
// home page jonno

app.get('/api/home/featured-startups', async (req, res) => {
  try {
    const featuredStartups = await startupsCollection.aggregate([
      { $match: { status: "Approved" } },
      { $sort: { _id: -1 } },
      { $limit: 3 },
      {
        $lookup: {
          from: "user", 
          localField: "founder_email",
          foreignField: "email",
          as: "founder_info"
        }
      },
      {
        $project: {
          startup_name: 1,
          logo: 1,
          industry: 1,
          founder_name: { $ifNull: [{ $arrayElemAt: ["$founder_info.name", 0] }, "Unknown Founder"] },
          team_size_needed: { $literal: "2-4 Members" } 
        }
      }
    ]).toArray();

    res.json({ success: true, startups: featuredStartups });
  } catch (error) {
    console.error("Error fetching featured startups:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


app.get('/api/home/featured-opportunities', async (req, res) => {
  try {
    const featuredOpportunities = await opportunitiesCollection.aggregate([
      { $sort: { _id: -1 } },
      { $limit: 3 },
      {
        $lookup: {
          from: "startups", 
          localField: "founder_email",
          foreignField: "founder_email",
          as: "startup_info"
        }
      },
      {
        $project: {
          role_title: 1,
          required_skills: 1,
          deadline: 1,
          startup_name: { $ifNull: [{ $arrayElemAt: ["$startup_info.startup_name", 0] }, "Remote Startup"] }
        }
      }
    ]).toArray();

    res.json({ success: true, opportunities: featuredOpportunities });
  } catch (error) {
    console.error("Error fetching featured opportunities:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get('/api/startups', async (req, res) => {
  try {
    const allStartups = await startupsCollection
      .find({ status: "Approved" })
      .sort({ _id: -1 }) 
      .toArray();

    res.json({
      success: true,
      startups: allStartups
    });
  } catch (error) {
    console.error("Error fetching all startups:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});





    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`)
})