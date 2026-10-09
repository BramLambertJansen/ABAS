// Alleen de laatste beslissende review van een aangewezen reviewer op de
// actuele commit telt. Een label of een review van de auteur is geen akkoord.
export function heeftGoedkeuring(reviews, head, auteur, goedkeurders) {
  if (!Array.isArray(reviews) || !/^[a-f0-9]{40}$/.test(head) || typeof auteur !== "string" || !auteur || !Array.isArray(goedkeurders)) return false;
  const laatste = new Map();
  for (const review of reviews.filter((r) => r && typeof r === "object").sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
    if (!["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state)) continue;
    if (typeof review.user?.login === "string") laatste.set(review.user.login.toLowerCase(), review);
  }
  return goedkeurders.some((login) => {
    if (typeof login !== "string") return false;
    const review = laatste.get(login.toLowerCase());
    return login.toLowerCase() !== auteur.toLowerCase() && review?.state === "APPROVED" && review.commit_id === head;
  });
}
