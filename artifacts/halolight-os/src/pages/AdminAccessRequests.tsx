import Admin from "./Admin";

/** Sign-ups awaiting approval: the users console pre-filtered on pending access. */
export default function AdminAccessRequests() {
  return <Admin initialAccessFilter="pending" />;
}
