import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

export const archive = mutation({
  args: { id: v.id("documents") }, // pass the documnent id
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity(); // get the user idendity

    if (!identity) {   // if we dont have the user identitiy we cant fetch the documents
      throw new Error("Not authenticated");
    }

    const userId = identity.subject; // extract the user id from the identity

    const existingDocument = await ctx.db.get(args.id); // fetch the document using that id

    if (!existingDocument) {
      throw new Error("Not fond");
    }

    if (existingDocument?.userId !== userId) { // make sure the userID of the document match the userId that loged in
      throw new Error("Unauthorized");
    }

    const recursiveArchive = async (documentId: Id<"documents">) => {  // recurively arhcive or delting all the children of a documnt if i delete the parent document
      const children = await ctx.db
        .query("documents")
        .withIndex("by_user_parent", (q) =>
          q.eq("userId", userId).eq("parentDocument", documentId)
        )
        .collect();

      for (const child of children) {
        // for loop to repeate the the same above with every  child of the document, and we dont use foreach or map becouse we are using a promise inside of that like asyne await
        await ctx.db.patch(child._id, {
          isArchived: true,
        });

        await recursiveArchive(child._id); // re run the enteire function again
      }
    };

    const document = await ctx.db.patch(args.id, {
      // we archive that document using the pach function followed with the id we trying to modifiy // and modify the data insdie its object by putting it  to be archived
      isArchived: true,
    });

    recursiveArchive(args.id); // after we mofiy the main document to be dleted above we pass that id , it fetsh all the children that have that id as perant document
    // so we repeate the recurive func again to  make sure all childrens themself dont have othe rchildren and are archived too, to got the end of the nested child
    return document;
  },
});

export const getSidebar = query({
  args: {
    parentDocument: v.optional(v.id("documents")), //check schema.ts to see all the  valid types
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity(); // get the user idendity

    if (!identity) {
      // if we dont have the user identitiy we cant fetch the documents
      throw new Error("Not authenticated");
    }

    const userId = identity.subject; // extract the user id from the identity

    const documents = await ctx.db
      .query("documents") // using fast queries becouse becouse  they are indexed in the schema.ta
      .withIndex("by_user_parent", (q) =>
        q.eq("userId", userId).eq("parentDocument", args.parentDocument)
      )
      .filter(
        (q) => q.eq(q.field("isArchived"), false) // so we dont want to show any of the deleted or archived documents
      )
      .order("desc")
      .collect();

    return documents;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    parentDocument: v.optional(v.id("documents")), // we are creating a document so evrer doc have to have a title but optional (nullable) to have perat doc
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      // when not logedin user try to create a new doc we wont allow it!
      throw new Error("Not authenticated");
    }

    const userId = identity.subject; // extract the user id from the subject

    const document = await ctx.db.insert("documents", {
      // creating new doc and put in the documents table in the db
      title: args.title,
      parentDocument: args.parentDocument,
      userId,
      isArchived: false,
      isPublished: false,
    });
    return document;
  },
});