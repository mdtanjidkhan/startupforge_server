const express = require('express');
const app = express()
const cors = require('cors')
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const PORT = process.env.PORT
app.use(cors());
app.use(express.json());
const uri = process.env.MONGODB_URI;


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
async function run() {
  try {
    
    await client.connect();
     const database = client.db("StartupForge");
     const opportunitiesCollection = database.collection("opportunities");
     const startupsCollection = database.collection("startups");
     const applicationsCollection = database.collection("applications");
     const profilesCollection = database.collection("profiles");


app.post('/api/opportunities', async (req, res) => {
  try {
    const opportunityData = req.body;
    
    if (!opportunityData.role_title || !opportunityData.required_skills || !opportunityData.work_type || !opportunityData.commitment_level || !opportunityData.deadline) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const newOpportunity = {
      ...opportunityData,
      founder_email: opportunityData.founder_email || "founder@example.com", 
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

// STARTUP PROFILE ROUTES 

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


app.post('/api/my-startup', async (req, res) => {
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

//   (PATCH)
app.patch('/api/my-startup/:id', async (req, res) => {
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
app.delete('/api/my-startup/:id', async (req, res) => {
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

app.post('/api/applications', async (req, res) => {
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
          status: 1,
          applied_at: 1,
          role_title: { $ifNull: ["$opportunity_details.role_title", "$role_title"] },
          startup_name: { $ifNull: ["$opportunity_details.startup_name", "$founder_email"] } 
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

// 

app.get('/api/collaborator-stats', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: "Email query parameter is required!" 
      });
    }
    const totalCount = await applicationsCollection.countDocuments({ applicant_email: email });
    const pendingCount = await applicationsCollection.countDocuments({ applicant_email: email, status: "Pending" });
    const rejectedCount = await applicationsCollection.countDocuments({ applicant_email: email, status: "Rejected" });
    res.status(200).json({
      success: true,
      total: totalCount,
      pending: pendingCount,
      rejected: rejectedCount
    });
  } catch (error) {
    console.error("Error fetching collaborator stats:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal Server Error" 
    });
  }
});

// //  Application founder


// 
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
          status: 1, // 'Pending', 'Accepted', 'Rejected'
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


// ২.  (Accepted/Rejected) 
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
      res.status(404).json({ success: false, message: "Application not found." });
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


    await client.db("admin").command({ ping: 1 });
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